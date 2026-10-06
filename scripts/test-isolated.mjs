import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { provisionIsolatedRuntime } from './lib/isolated-runtime.mjs';
import { localDockerConnection } from './lib/docker-local.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2];
if (!['integration', 'e2e', 'e2e-local', 'e2e-analytics'].includes(mode))
    throw new Error('Escolha integration, e2e ou e2e-local.');
const localAccess = mode === 'e2e-local';
const analyticsTest = mode === 'e2e-analytics';
const dockerConnection = localDockerConnection({ cwd: root });
const name = `spm-test-${randomBytes(8).toString('hex')}`;
const password = randomBytes(24).toString('base64url');
const storageDir = resolve(root, 'tmp', name);
let created = false;
let child;
function docker(args) {
    const result = spawnSync('docker', dockerConnection.args(args), {
        encoding: 'utf8',
        cwd: root,
        windowsHide: true,
        env: dockerConnection.env,
    });
    if (result.status !== 0)
        throw new Error(`Docker indisponível ou operação de teste falhou: ${args[0]}`);
    return result.stdout.trim();
}
function run(script, args, env) {
    return new Promise((resolveRun, reject) => {
        child = spawn(process.execPath, [resolve(root, script), ...args], {
            cwd: root,
            env,
            stdio: 'inherit',
            windowsHide: true,
        });
        child.once('error', reject);
        child.once('exit', (code) =>
            code === 0 ? resolveRun() : reject(new Error(`Etapa ${script} falhou (${code}).`)),
        );
    });
}
function cleanup() {
    if (!created) return;
    // Só apaga o container efêmero criado por esta execução, após conferir rótulo e nome exatos.
    const label = docker([
        'inspect',
        '--format',
        '{{index .Config.Labels "spm.isolated-test"}}',
        name,
    ]);
    if (label !== name)
        throw new Error('Rótulo do container de testes divergente; remoção recusada.');
    docker(['rm', '-f', name]);
    created = false;
    if (/^spm-test-[a-f0-9]{16}$/.test(name) && storageDir === resolve(root, 'tmp', name)) {
        rmSync(storageDir, { recursive: true, force: true });
    }
}
for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
        child?.kill();
        cleanup();
        process.exit(130);
    });

try {
    docker([
        'run',
        '-d',
        '--name',
        name,
        '--label',
        `spm.isolated-test=${name}`,
        '-e',
        'POSTGRES_USER=spm_test',
        '-e',
        `POSTGRES_PASSWORD=${password}`,
        '-e',
        'POSTGRES_DB=spm_test',
        '-p',
        '127.0.0.1::5432',
        'postgres:18.6-alpine',
    ]);
    created = true;
    const port = docker(['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
    if (!port) throw new Error('Não foi possível determinar a porta isolada.');
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
        const result = spawnSync(
            'docker',
            dockerConnection.args(['exec', name, 'pg_isready', '-U', 'spm_test', '-d', 'spm_test']),
            { windowsHide: true, stdio: 'ignore', env: dockerConnection.env },
        );
        if (result.status === 0) {
            ready = true;
            break;
        }
        await new Promise((done) => setTimeout(done, 500));
    }
    if (!ready) throw new Error('Postgres de teste não inicializou.');
    // Substitui configuração sensível herdada; nunca lê nem migra DATABASE_URL do usuário.
    const env = {
        ...process.env,
        ...dockerConnection.env,
        NODE_ENV: 'test',
        SPM_ISOLATED_TEST_RUN: name,
        SPM_ISOLATED_TEST_DATABASE_ROLE: 'spm_test',
        DATABASE_URL: `postgresql://spm_test:${password}@127.0.0.1:${port}/spm_test`,
        APP_URL: 'http://localhost:3147',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3147',
        DEPLOYMENT_TARGET: 'local',
        K_SERVICE: '',
        K_REVISION: '',
        K_CONFIGURATION: '',
        LOCAL_TEST_AUTH_ENABLED: localAccess ? 'true' : 'false',
        LOCAL_TEST_AUTH_USER_ID: localAccess ? 'e2e-admin' : '',
        E2E_LOCAL_TEST_AUTH: localAccess ? 'true' : 'false',
        AUTH_SECRET: randomBytes(48).toString('base64'),
        CRON_SECRET: randomBytes(48).toString('base64'),
        ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_DIR: storageDir,
        GCS_BUCKET: '',
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        GOOGLE_OAUTH_CLIENT_ID: localAccess ? '' : 'isolated-e2e-test.apps.googleusercontent.com',
        GOOGLE_OAUTH_CLIENT_SECRET: localAccess ? '' : 'isolated-e2e-test-never-valid',
        GOOGLE_OAUTH_ALLOWED_DOMAIN: localAccess ? '' : 'example.test',
        GOOGLE_WORKSPACE_MFA_ENFORCED: localAccess ? 'false' : 'true',
        TRANSLATION_ENABLED: mode === 'e2e' ? 'true' : 'false',
        E2E_TRANSLATION_ENABLED: mode === 'e2e' ? 'true' : 'false',
        GOOGLE_CLOUD_PROJECT: mode === 'e2e' ? 'isolated-test-only' : '',
        TRANSLATION_LOCATION: 'global',
        TRANSLATION_DAILY_CHARACTER_LIMIT: '0',
        GOOGLE_APPLICATION_CREDENTIALS: '',
        GOOGLE_CALENDAR_ID: '',
        GOOGLE_CALENDAR_API_KEY: '',
        ANALYTICS_ENABLED: analyticsTest ? 'true' : 'false',
        GA_MEASUREMENT_ID: analyticsTest ? 'G-TEST123456' : '',
        GA_ENHANCED_MEASUREMENT_DISABLED: analyticsTest ? 'true' : 'false',
        E2E_ANALYTICS: analyticsTest ? 'true' : 'false',
        TRUSTED_PROXY_HOPS: '',
        SEED_ADMIN_PASSWORD: '',
        BOOTSTRAP_ADMIN_PASSWORD: '',
        USER_PASSWORD: '',
        E2E_ADMIN_PASSWORD: randomBytes(24).toString('base64url'),
        E2E_SESSION_TOKEN: randomBytes(32).toString('base64url'),
        E2E_MOBILE_SESSION_TOKEN: randomBytes(32).toString('base64url'),
        // Evita que Prisma/dotenv herde integrações/segredos reais durante setup.
        DOTENV_CONFIG_PATH: resolve(storageDir, 'nonexistent-test.env'),
        DOTENV_CONFIG_OVERRIDE: '',
        DOTENV_CONFIG_QUIET: 'true',
        DOTENV_KEY: '',
        NODE_OPTIONS: '',
        DB_POOL_MAX: '5',
        DATABASE_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_QUERY_TIMEOUT_MS: '10000',
    };
    console.log(
        `Banco de testes descartável criado (${name}). Banco e volumes da aplicação não serão usados.`,
    );
    await run('node_modules/prisma/build/index.js', ['migrate', 'deploy'], env);
    if (mode === 'integration')
        await run(
            'node_modules/vitest/vitest.mjs',
            ['run', '--config', 'vitest.integration.config.ts'],
            env,
        );
    else {
        await run(
            'node_modules/tsx/dist/cli.mjs',
            ['--conditions=react-server', 'scripts/test-fixtures.ts'],
            env,
        );
        const runtime = await provisionIsolatedRuntime(env.DATABASE_URL, name);
        console.log(`Papel runtime E2E verificado: ${JSON.stringify(runtime.role)}.`);
        await run(
            'node_modules/@playwright/test/cli.js',
            localAccess
                ? ['test', '--grep', 'acesso local']
                : analyticsTest
                  ? ['test', '--grep', 'consentimento Analytics']
                  : ['test'],
            {
                ...env,
                DATABASE_URL: runtime.databaseUrl,
                SPM_ISOLATED_TEST_DATABASE_ROLE: 'spm_e2e_app',
            },
        );
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha nos testes isolados.');
    process.exitCode = 1;
} finally {
    cleanup();
    console.log(
        'Container de testes removido; dados sintéticos descartados. Volumes da aplicação preservados.',
    );
}
