/** Carga somente em containers próprios, sem URL externa ou banco existente. */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { localDockerConnection } from './lib/docker-local.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const allowedProfiles = [
    'smoke',
    'baseline',
    'stress',
    'recovery',
    'auth',
    'upload',
    'audience',
    'capacity',
];
if (
    args.some(
        (arg) =>
            arg !== '--skip-build' &&
            !/^--engine=(k6|monotonic)$/.test(arg) &&
            !/^--encoding=(gzip|identity)$/.test(arg) &&
            !/^--profile=(smoke|baseline|stress|recovery|auth|upload|audience|capacity)$/.test(arg),
    )
) {
    throw new Error(
        'Use --skip-build, --encoding=gzip|identity, --engine=k6|monotonic e/ou --profile=smoke|baseline|stress|recovery|auth|upload|audience|capacity.',
    );
}
const selected = args.filter((arg) => arg.startsWith('--profile=')).map((arg) => arg.split('=')[1]);
if (new Set(selected).size !== selected.length)
    throw new Error('Não repita um perfil no mesmo ensaio.');
if (args.filter((arg) => arg.startsWith('--encoding=')).length > 1)
    throw new Error('Escolha uma única codificação.');
const profiles = selected.length
    ? selected
    : allowedProfiles.filter((profile) => profile !== 'capacity');
const encoding = args.find((arg) => arg.startsWith('--encoding='))?.split('=')[1] || 'gzip';
if (args.filter((arg) => arg.startsWith('--engine=')).length > 1)
    throw new Error('Escolha um único motor.');
const engine = args.find((arg) => arg.startsWith('--engine='))?.split('=')[1] || 'k6';
if (engine === 'monotonic' && (profiles.length !== 1 || profiles[0] !== 'capacity')) {
    throw new Error('O motor monotônico é restrito a --profile=capacity.');
}
const dockerConnection = localDockerConnection({ cwd: root });
const runId = `spm-load-${randomBytes(8).toString('hex')}`;
const names = { network: runId, db: `${runId}-db`, app: `${runId}-app` };
const label = 'spm.isolated-load';
const appImage = 'spmnacional-front:load-test';
const pgImage = 'postgres@sha256:dc17045ccfd343b49600570ea734b9c4991cf1c3f3302e67df51e3b402dd55c4';
const k6Image =
    'grafana/k6@sha256:e7eeddf1ce2361df6920d925297f487c0ba549c44be242c6a9c22f28d9b08efa';
const nodeImage = 'node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402';
const resultsDir = resolve(root, 'load-results', runId);
mkdirSync(resultsDir, { recursive: true });
const password = randomBytes(24).toString('base64url');
const tokens = Array.from({ length: 3 }, () => randomBytes(32).toString('base64url'));
const token = tokens[0];
const authSecret = randomBytes(48).toString('base64');
const cronSecret = randomBytes(48).toString('base64');
const aesKey = randomBytes(32).toString('base64');
const adminPassword = randomBytes(24).toString('base64url');
const secrets = [password, ...tokens, authSecret, cronSecret, aesKey, adminPassword];
const scrub = (value) =>
    secrets.reduce((out, secret) => out.split(secret).join('[REDACTED]'), value);
const resources = new Set();
let networkCreated = false;
let child;
let monitor;
let sampling = false;
let currentPhase = 'setup';
let currentGenerator;
let appUrl;
let fixtureEnv;
let cancelled = false;
let failures = false;
const report = {
    runId,
    startedAt: new Date().toISOString(),
    profiles,
    engine,
    acceptEncoding: encoding,
    audience: profiles.includes('audience')
        ? {
              model: 'closed, constant-vus; not an arrival-rate-to-users conversion',
              readers: 50,
              editors: 3,
              seconds: 180,
              readerThinkTimeSeconds: [2, 5],
              editorThinkTimeSeconds: [4, 7],
              establishedEditorSessions: 3,
          }
        : null,
    limits: {
        appCpu: 1,
        appMemoryMiB: 512,
        postgresCpu: 1,
        postgresMemoryMiB: 512,
        generatorCpu: 2,
        generatorMemoryMiB: 512,
        databasePool: 5,
    },
    network:
        'Dedicated Docker bridge; only random loopback ports; integrations disabled and load URLs allowlisted',
    phases: [],
    samples: [],
};

function command(executable, commandArgs, options = {}) {
    const dockerOperation = executable === 'docker';
    const result = spawnSync(
        executable,
        dockerOperation ? dockerConnection.args(commandArgs) : commandArgs,
        {
            encoding: 'utf8',
            cwd: root,
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
            timeout: 120000,
            ...options,
            ...(dockerOperation
                ? { env: dockerConnection.withEnv(options.env || process.env) }
                : {}),
        },
    );
    if (result.status !== 0)
        throw new Error(
            `Etapa ${executable} ${commandArgs[0]} falhou (${result.status}). ${scrub(result.stderr || '').slice(0, 1000)}`,
        );
    return result.stdout.trim();
}
const docker = (commandArgs, options = {}) => command('docker', commandArgs, options);
function captureAsync(executable, commandArgs) {
    return new Promise((done, reject) => {
        const probe = spawn(
            executable,
            executable === 'docker' ? dockerConnection.args(commandArgs) : commandArgs,
            {
                cwd: root,
                windowsHide: true,
                timeout: 20000,
                stdio: ['ignore', 'pipe', 'pipe'],
                ...(executable === 'docker' ? { env: dockerConnection.env } : {}),
            },
        );
        let stdout = '';
        let stderr = '';
        probe.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        probe.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        probe.once('error', reject);
        probe.once('close', (code) => {
            if (code !== 0)
                reject(new Error(`Probe falhou (${code}): ${scrub(stderr).slice(0, 300)}`));
            else done(stdout.trim());
        });
    });
}
function execute(executable, commandArgs, options = {}) {
    return new Promise((done, reject) => {
        child = spawn(
            executable,
            executable === 'docker' ? dockerConnection.args(commandArgs) : commandArgs,
            {
                cwd: root,
                windowsHide: true,
                stdio: 'inherit',
                ...options,
                ...(executable === 'docker'
                    ? { env: dockerConnection.withEnv(options.env || process.env) }
                    : {}),
            },
        );
        child.once('error', reject);
        child.once('exit', (code) => {
            child = undefined;
            done(code);
        });
    });
}
function inspectState(name) {
    return JSON.parse(docker(['inspect', '--format', '{{json .State}}', name]));
}
function assertOwned(name) {
    if (!resources.has(name) || !name.startsWith(`${runId}-`))
        throw new Error('Container fora do ensaio.');
    if (docker(['inspect', '--format', `{{index .Config.Labels "${label}"}}`, name]) !== runId)
        throw new Error('Rótulo divergente; operação recusada.');
}
function removeContainer(name) {
    if (!resources.has(name)) return;
    assertOwned(name);
    docker(['rm', '-f', name]);
    resources.delete(name);
}
function cleanup() {
    clearInterval(monitor);
    for (const name of [...resources].reverse()) removeContainer(name);
    if (networkCreated) {
        if (
            docker([
                'network',
                'inspect',
                '--format',
                `{{index .Labels "${label}"}}`,
                names.network,
            ]) !== runId
        )
            throw new Error('Rede não pertence ao ensaio; remoção recusada.');
        docker(['network', 'rm', names.network]);
        networkCreated = false;
    }
}
function sql(query) {
    assertOwned(names.db);
    return docker([
        'exec',
        names.db,
        'psql',
        '-U',
        'spm_load',
        '-d',
        'spm_load',
        '-A',
        '-t',
        '-c',
        query,
    ]);
}
function databaseStats() {
    return JSON.parse(
        sql(`SELECT json_build_object(
        'connections', (SELECT count(*) FROM pg_stat_activity WHERE application_name='spm-site'),
        'active', (SELECT count(*) FROM pg_stat_activity WHERE application_name='spm-site' AND state='active'),
        'waitingLocks', (SELECT count(*) FROM pg_stat_activity WHERE application_name='spm-site' AND wait_event_type='Lock'),
        'commits', xact_commit, 'rollbacks', xact_rollback, 'deadlocks', deadlocks,
        'blocksRead', blks_read, 'blocksHit', blks_hit, 'tempBytes', temp_bytes,
        'blockReadMs', blk_read_time, 'blockWriteMs', blk_write_time
        ) FROM pg_stat_database WHERE datname='spm_load';`),
    );
}
function cpuStats(name) {
    assertOwned(name);
    return Object.fromEntries(
        docker(['exec', name, 'cat', '/sys/fs/cgroup/cpu.stat'])
            .split('\n')
            .map((line) => {
                const [key, value] = line.trim().split(/\s+/);
                return [key, Number(value)];
            }),
    );
}
async function health() {
    const started = performance.now();
    try {
        const response = await fetch(`${appUrl}/api/health/ready`, {
            redirect: 'manual',
            signal: AbortSignal.timeout(5000),
            headers: { Connection: 'close' },
        });
        await response.arrayBuffer();
        return { status: response.status, latencyMs: performance.now() - started };
    } catch (error) {
        const code = error?.cause?.code || error?.name;
        return {
            status: 0,
            latencyMs: performance.now() - started,
            errorCode:
                typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code) ? code : 'UNKNOWN',
        };
    }
}
async function sample() {
    if (sampling || !resources.has(names.app)) return;
    sampling = true;
    const phase = currentPhase;
    try {
        const containerNames = [names.app, names.db, currentGenerator].filter(
            (name) => name && resources.has(name),
        );
        // Não bloquear o event loop enquanto a sonda HTTP mede a aplicação.
        const stats = (
            await captureAsync('docker', [
                'stats',
                '--no-stream',
                '--format',
                '{{json .}}',
                ...containerNames,
            ])
        )
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        report.samples.push({
            timestamp: new Date().toISOString(),
            phase,
            stats,
            database: databaseStats(),
            health: await health(),
        });
    } catch {
        report.samples.push({ timestamp: new Date().toISOString(), phase, samplingError: true });
    } finally {
        sampling = false;
    }
}
function fixtures(mode) {
    return JSON.parse(
        command(
            process.execPath,
            [
                resolve(root, 'node_modules/tsx/dist/cli.mjs'),
                '--conditions=react-server',
                'scripts/load-fixtures.ts',
                mode,
            ],
            { env: fixtureEnv },
        ),
    );
}
async function permissionsProbe() {
    const path = '/api/arquivos/biblioteca/carga-0250.png';
    const anonymous = await fetch(appUrl + path, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
    });
    await anonymous.arrayBuffer();
    const authenticated = await fetch(appUrl + path, {
        headers: { Cookie: `__Host-spm_session=${token}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
    });
    const bytes = await authenticated.arrayBuffer();
    const passed =
        anonymous.status === 404 && authenticated.status === 200 && bytes.byteLength === 65536;
    report.privateFileCheck = {
        anonymousStatus: anonymous.status,
        authenticatedStatus: authenticated.status,
        bytes: bytes.byteLength,
        passed,
    };
    if (!passed) throw new Error('Pré-teste de mídia privada falhou; carga cancelada.');
}
function pngFixture() {
    const bytes = Buffer.alloc(65536);
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQm8AAAAASUVORK5CYII=',
        'base64',
    ).copy(bytes);
    return bytes;
}
async function protectionProbe() {
    const alreadyCreated = Number(
        sql('SELECT count(*) FROM "Media" WHERE "storageKey" NOT LIKE \'biblioteca/carga-%\';'),
    );
    const remaining = Math.max(0, 30 - alreadyCreated);
    const statuses = [];
    for (let index = 0; index < remaining + 5; index++) {
        const response = await fetch(`${appUrl}/api/admin/uploads?purpose=biblioteca`, {
            method: 'POST',
            redirect: 'manual',
            signal: AbortSignal.timeout(8000),
            body: pngFixture(),
            headers: {
                Cookie: `__Host-spm_session=${token}`,
                Origin: 'http://localhost:3000',
                'Content-Type': 'image/png',
                'x-file-name': `limite-sintetico-${index}.png`,
            },
        });
        statuses.push(response.status);
        await response.arrayBuffer();
    }
    const passed =
        statuses.slice(0, remaining).every((status) => status === 201) &&
        statuses.slice(remaining).every((status) => status === 429);
    report.uploadRateLimit = {
        previousUploads: alreadyCreated,
        remainingAllowed: remaining,
        statuses,
        passed,
    };
    if (!passed) failures = true;
}

for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
        cancelled = true;
        child?.kill();
        try {
            cleanup();
        } finally {
            process.exit(130);
        }
    });

try {
    report.dockerCapacity = JSON.parse(
        docker(['info', '--format', '{"cpus":{{.NCPU}},"memoryBytes":{{.MemTotal}}}']),
    );
    if (!args.includes('--skip-build')) {
        console.log('[carga] Construindo imagem isolada de produção (sem alterar :latest).');
        if ((await execute('docker', ['build', '--target', 'runner', '-t', appImage, '.'])) !== 0)
            throw new Error('Build da imagem de teste falhou.');
    }
    report.images = {
        app: docker(['image', 'inspect', '--format', '{{.Id}}', appImage]),
        postgres: pgImage,
        ...(engine === 'k6' ? { k6: k6Image } : { node: nodeImage }),
    };
    if (engine === 'k6')
        report.k6Version = docker([
            'run',
            '--rm',
            '--pull',
            'never',
            '--network',
            'none',
            k6Image,
            'version',
        ]);
    else
        report.nodeVersion = docker([
            'run',
            '--rm',
            '--pull',
            'never',
            '--network',
            'none',
            nodeImage,
            'node',
            '--version',
        ]);
    report.gitCommit = command('git', ['rev-parse', 'HEAD']);
    report.gitDirty = command('git', ['status', '--porcelain']).length > 0;
    docker(['network', 'create', '--label', `${label}=${runId}`, names.network]);
    networkCreated = true;
    docker(
        [
            'run',
            '-d',
            '--name',
            names.db,
            '--label',
            `${label}=${runId}`,
            '--network',
            names.network,
            '--network-alias',
            'spm-load-db',
            '--cpus',
            '1',
            '--memory',
            '512m',
            '--memory-swap',
            '512m',
            '--pids-limit',
            '128',
            '--tmpfs',
            '/var/lib/postgresql/data:rw,size=268435456',
            '-p',
            '127.0.0.1::5432',
            '-e',
            'POSTGRES_USER=spm_load',
            '-e',
            'POSTGRES_DB=spm_load',
            '-e',
            'POSTGRES_PASSWORD',
            pgImage,
            '-c',
            'max_connections=30',
            '-c',
            'shared_buffers=64MB',
            '-c',
            'shared_preload_libraries=pg_stat_statements',
            '-c',
            'track_io_timing=on',
        ],
        { env: { ...process.env, POSTGRES_PASSWORD: password } },
    );
    resources.add(names.db);
    const port = docker(['port', names.db, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
    if (!port) throw new Error('Porta do banco de carga não identificada.');
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
        const probe = spawnSync(
            'docker',
            dockerConnection.args([
                'exec',
                names.db,
                'pg_isready',
                '-U',
                'spm_load',
                '-d',
                'spm_load',
            ]),
            { windowsHide: true, stdio: 'ignore', env: dockerConnection.env },
        );
        if (probe.status === 0) {
            ready = true;
            break;
        }
        await new Promise((done) => setTimeout(done, 500));
    }
    if (!ready) throw new Error('Banco de carga não iniciou.');
    const sharedEnv = {
        NODE_ENV: 'production',
        APP_URL: 'http://localhost:3000',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        DEPLOYMENT_TARGET: 'local',
        K_SERVICE: '',
        AUTH_SECRET: authSecret,
        CRON_SECRET: cronSecret,
        ENCRYPTION_KEY: aesKey,
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_DIR: '/app/storage/uploads',
        GCS_BUCKET: '',
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        // Credenciais sem validade; as sessões são fixtures locais, sem chamar Google.
        GOOGLE_OAUTH_CLIENT_ID: 'isolated-load-test.apps.googleusercontent.com',
        GOOGLE_OAUTH_CLIENT_SECRET: 'isolated-load-test-never-valid',
        GOOGLE_OAUTH_ALLOWED_DOMAIN: 'example.test',
        GOOGLE_WORKSPACE_MFA_ENFORCED: 'true',
        TRANSLATION_ENABLED: 'false',
        GOOGLE_CLOUD_PROJECT: '',
        TRANSLATION_LOCATION: 'global',
        TRANSLATION_DAILY_CHARACTER_LIMIT: '50000',
        GOOGLE_CALENDAR_ID: '',
        GOOGLE_CALENDAR_API_KEY: '',
        ANALYTICS_ENABLED: 'false',
        GA_MEASUREMENT_ID: '',
        GA_ENHANCED_MEASUREMENT_DISABLED: 'false',
        TRUSTED_PROXY_HOPS: '',
        SEED_ADMIN_PASSWORD: '',
        DB_POOL_MAX: '5',
        DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_QUERY_TIMEOUT_MS: '10000',
        NEXT_TELEMETRY_DISABLED: '1',
        PGSSLMODE: '',
        NODE_TLS_REJECT_UNAUTHORIZED: '1',
    };
    fixtureEnv = {
        ...process.env,
        ...dockerConnection.env,
        ...sharedEnv,
        SPM_LOAD_RUN: runId,
        DATABASE_URL: `postgresql://spm_load:${password}@127.0.0.1:${port}/spm_load`,
        LOAD_SESSION_TOKEN: token,
        LOAD_SESSION_TOKENS: JSON.stringify(tokens),
        LOAD_ADMIN_PASSWORD: adminPassword,
        // Prisma importa dotenv/config: nunca ler .env nem aceitar override herdado.
        DOTENV_CONFIG_PATH: resolve(resultsDir, 'nonexistent-load.env'),
        DOTENV_CONFIG_OVERRIDE: '',
        DOTENV_CONFIG_QUIET: 'true',
        DOTENV_KEY: '',
        NODE_OPTIONS: '',
    };
    console.log('[carga] Aplicando migrações somente no PostgreSQL descartável.');
    if (
        (await execute(
            process.execPath,
            [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
            { env: fixtureEnv },
        )) !== 0
    )
        throw new Error('Migração sintética falhou.');
    report.fixtures = fixtures('seed');
    // Exercise the application with the same least-privilege role used by GCP,
    // rather than accidentally bypassing RLS through the PostgreSQL test owner.
    sql(`CREATE ROLE spm_load_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
         GRANT USAGE ON SCHEMA public TO spm_load_app;
         GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO spm_load_app;
         GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spm_load_app;
         REVOKE ALL ON TABLE _prisma_migrations FROM spm_load_app;`);
    report.runtimeRole = { name: 'spm_load_app', superuser: false, bypassRls: false, owner: false };
    sql('CREATE EXTENSION pg_stat_statements;');
    const appEnv = {
        ...sharedEnv,
        DATABASE_URL: `postgresql://spm_load_app:${password}@spm-load-db:5432/spm_load`,
    };
    docker(
        [
            'run',
            '-d',
            '--name',
            names.app,
            '--label',
            `${label}=${runId}`,
            '--network',
            names.network,
            '--network-alias',
            'spm-load-app',
            '--cpus',
            '1',
            '--memory',
            '512m',
            '--memory-swap',
            '512m',
            '--pids-limit',
            '256',
            '--cap-drop',
            'ALL',
            '--security-opt',
            'no-new-privileges:true',
            '--tmpfs',
            '/tmp:rw,size=67108864',
            '--tmpfs',
            '/app/storage/uploads:rw,size=134217728,uid=1001,gid=1001',
            '-p',
            '127.0.0.1::3000',
            ...Object.keys(appEnv).flatMap((key) => ['-e', key]),
            appImage,
        ],
        { env: { ...process.env, ...appEnv } },
    );
    resources.add(names.app);
    const appPort = docker(['port', names.app, '3000/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
    if (!appPort) throw new Error('Porta HTTP do ensaio não identificada.');
    appUrl = `http://127.0.0.1:${appPort}`;
    docker(['exec', '-i', names.app, 'node'], {
        input: `const fs=require('node:fs'); const b=Buffer.from('${pngFixture().toString('base64')}','base64'); fs.mkdirSync('/app/storage/uploads/biblioteca',{recursive:true}); for(let i=1;i<=250;i++)fs.writeFileSync('/app/storage/uploads/biblioteca/carga-'+String(i).padStart(4,'0')+'.png',b,{flag:'wx'});`,
    });
    ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        if ((await health()).status === 200) {
            ready = true;
            break;
        }
        if (!inspectState(names.app).Running) break;
        await new Promise((done) => setTimeout(done, 1000));
    }
    if (!ready) throw new Error('Imagem de produção não ficou pronta no ambiente isolado.');
    await permissionsProbe();
    sql('SELECT pg_stat_statements_reset();');
    monitor = setInterval(() => {
        void sample();
    }, 5000);
    for (const profile of profiles) {
        if (cancelled) break;
        currentPhase = profile;
        const name = `${runId}-${profile}`;
        const phase = {
            profile,
            startedAt: new Date().toISOString(),
            beforeDb: databaseStats(),
            beforeCpu: cpuStats(names.app),
        };
        console.log(`[carga] Iniciando ${profile}. Servidor: 1 CPU, 512 MiB; pool: 5.`);
        const generatorEnv = {
            ...process.env,
            BASE_URL: 'http://spm-load-app:3000',
            SPM_LOAD_RUN: runId,
            LOAD_PROFILE: profile,
            LOAD_ENCODING: encoding,
            ...(engine === 'k6'
                ? {
                      AUTH_COOKIE: `__Host-spm_session=${token}`,
                      AUTH_COOKIES: JSON.stringify(
                          tokens.map((value) => `__Host-spm_session=${value}`),
                      ),
                  }
                : { AUTH_COOKIE: '', AUTH_COOKIES: '', K6_HTTP_DEBUG: '' }),
        };
        docker(
            [
                'create',
                '--pull',
                'never',
                '--name',
                name,
                '--label',
                `${label}=${runId}`,
                '--network',
                names.network,
                '--cpus',
                '2',
                '--memory',
                '512m',
                '--memory-swap',
                '512m',
                '--pids-limit',
                '128',
                '--cap-drop',
                'ALL',
                '--security-opt',
                'no-new-privileges:true',
                ...(engine === 'monotonic' ? ['--read-only'] : []),
                '--mount',
                `type=bind,source=${resolve(root, 'tests/load')},target=/scripts,readonly`,
                '--mount',
                `type=bind,source=${resultsDir},target=/results`,
                '-e',
                'BASE_URL',
                '-e',
                'SPM_LOAD_RUN',
                '-e',
                'LOAD_PROFILE',
                '-e',
                'LOAD_ENCODING',
                ...(engine === 'k6'
                    ? [
                          '-e',
                          'AUTH_COOKIE',
                          '-e',
                          'AUTH_COOKIES',
                          k6Image,
                          'run',
                          '--quiet',
                          '--new-machine-readable-summary=false',
                          '--no-usage-report',
                          ...(['audience', 'capacity'].includes(profile)
                              ? ['--out', `json=/results/${profile}-points.json`]
                              : []),
                          '/scripts/scenarios.js',
                      ]
                    : [nodeImage, 'node', '--no-warnings', '/scripts/monotonic.mjs']),
            ],
            { env: generatorEnv },
        );
        resources.add(name);
        currentGenerator = name;
        phase.exitCode = await execute('docker', ['start', '-a', name]);
        phase.generatorState = inspectState(name);
        phase.endedAt = new Date().toISOString();
        phase.afterDb = databaseStats();
        phase.afterCpu = cpuStats(names.app);
        phase.appState = inspectState(names.app);
        phase.healthAfter = await health();
        phase.summaryFile = `${profile}.json`;
        if (['audience', 'capacity'].includes(profile))
            phase.timestampedMetricsFile = `${profile}-points.json`;
        try {
            phase.summary = JSON.parse(
                readFileSync(resolve(resultsDir, phase.summaryFile), 'utf8'),
            );
        } catch {
            phase.summaryMissing = true;
        }
        report.phases.push(phase);
        currentGenerator = undefined;
        removeContainer(name);
        if (
            phase.exitCode !== 0 ||
            phase.summaryMissing ||
            phase.summary?.loadTest?.passed !== true
        )
            failures = true;
        if (![0, 99].includes(phase.exitCode) || !phase.appState.Running)
            throw new Error(
                `Ensaio ${profile} falhou fora dos limiares de desempenho; veja evidências.`,
            );
        console.log(
            `[carga] ${profile}: exit ${phase.exitCode}; health ${phase.healthAfter.status}.`,
        );
    }
    if (profiles.includes('upload')) {
        currentPhase = 'upload-protection';
        await protectionProbe();
    }
    report.finalFixtureState = fixtures('inspect');
    const articleRequests = report.phases.reduce(
        (sum, phase) => sum + (phase.summary?.loadTest?.endpoints?.article?.requests?.count ?? 0),
        0,
    );
    const articleHadErrors = report.phases.some(
        (phase) => (phase.summary?.loadTest?.endpoints?.article?.errors?.rate ?? 0) > 0,
    );
    const observedViews =
        report.finalFixtureState.postViews.hotArticle - report.fixtures.postViews.hotArticle;
    report.viewCounterCheck = {
        articleRequests,
        observedViews,
        articleHadErrors,
        conclusive: !articleHadErrors,
        passed: articleHadErrors ? null : observedViews === articleRequests,
    };
    if (report.viewCounterCheck.passed === false) failures = true;
    report.topQueries = JSON.parse(
        sql(`SELECT coalesce(json_agg(t), '[]'::json) FROM (
        SELECT left(query, 1200) AS query, calls, round(total_exec_time::numeric,2) AS total_ms,
        round(mean_exec_time::numeric,3) AS mean_ms, rows, shared_blks_hit, shared_blks_read, temp_blks_written
        FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname='spm_load')
        AND query NOT LIKE '%pg_stat_%' AND query NOT LIKE '%json_build_object%'
        ORDER BY total_exec_time DESC LIMIT 12) t;`),
    );
    report.finalAppState = inspectState(names.app);
    report.finalHealth = await health();
} catch (error) {
    failures = true;
    report.error = scrub(error instanceof Error ? error.message : 'Falha no ensaio de carga.');
    console.error(`[carga] ${report.error}`);
} finally {
    clearInterval(monitor);
    // Dá tempo ao único probe de saúde já em andamento para concluir.
    while (sampling) await new Promise((done) => setTimeout(done, 100));
    if (resources.has(names.app)) {
        try {
            const logs = spawnSync('docker', dockerConnection.args(['logs', names.app]), {
                encoding: 'utf8',
                windowsHide: true,
                maxBuffer: 4 * 1024 * 1024,
                timeout: 15000,
                env: dockerConnection.env,
            });
            if (logs.status !== 0) throw new Error('Log indisponível.');
            writeFileSync(
                resolve(resultsDir, 'app.log'),
                scrub(`${logs.stdout}\n${logs.stderr}`),
                'utf8',
            );
        } catch {
            report.logUnavailable = true;
        }
    }
    try {
        cleanup();
        report.cleanedUp = true;
    } catch {
        report.cleanedUp = false;
        failures = true;
        console.error('[carga] Limpeza incompleta; conferir containers com rótulo do ensaio.');
    }
    report.endedAt = new Date().toISOString();
    const healthSamples = report.samples.filter((sample) => sample.health);
    report.healthObservations = {
        source: 'auxiliary host probe, separate from k6 workload thresholds',
        samples: healthSamples.length,
        failures: healthSamples.filter((sample) => sample.health.status !== 200).length,
    };
    report.passed = !failures;
    writeFileSync(resolve(resultsDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(`[carga] Relatório: ${resolve(resultsDir, 'report.json')}`);
    console.log(
        `[carga] ${report.cleanedUp ? 'Containers e rede próprios removidos; dados em tmpfs descartados.' : 'Há recursos de teste pendentes.'} Instalação atual preservada.`,
    );
    if (failures) process.exitCode = 1;
}
