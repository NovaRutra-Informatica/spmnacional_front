import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const compatibilityStep = 'Verificar compatibilidade das migrações com a revisão em serviço';
export const rollbackStep = 'Restaurar tráfego anterior em falha após promoção';
export const databaseProtocol = 'scoped-rls-v1';

const image = (name: string, digest: string) =>
    `southamerica-east1-docker.pkg.dev/fixture-project/fixture-repo/${name}@sha256:${digest.repeat(64)}`;

export const workflowFixture = {
    APP_IMAGE: image('app', 'a'),
    IMAGE: image('migrator', 'b'),
    MIGRATOR_IMAGE: image('migrator', 'b'),
    PREVIOUS_TRAFFIC: 'fixture-live-a=60,fixture-live-b=40',
    VERIFIED_PROTOCOL: databaseProtocol,
    REGION: 'southamerica-east1',
    SERVICE: 'fixture-service',
    MIGRATE_JOB: 'fixture-migrate',
    FIXTURE_APP_IMAGE: image('app', 'a'),
    FIXTURE_MIGRATOR_IMAGE: image('migrator', 'b'),
    FIXTURE_PREVIOUS_A_IMAGE: image('old-app-a', 'c'),
    FIXTURE_PREVIOUS_B_IMAGE: image('old-app-b', 'd'),
    FIXTURE_APP_LABEL: databaseProtocol,
    FIXTURE_MIGRATOR_LABEL: databaseProtocol,
    FIXTURE_PREVIOUS_A_LABEL: databaseProtocol,
    FIXTURE_PREVIOUS_B_LABEL: databaseProtocol,
    FIXTURE_SQL_EXIT: '0',
    FIXTURE_JOB_UPDATE_EXIT: '0',
    FIXTURE_PULL_EXIT: '0',
    FIXTURE_INSPECT_EXIT: '0',
    FIXTURE_REVISION_EXIT: '0',
} as const;

// Read the real step rather than maintaining a second copy of its security guards.
export function extractWorkflowRun(source: string, stepName: string): string {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const matches = lines.flatMap((line, index) =>
        line.trim() === `- name: ${stepName}` ? [index] : [],
    );
    if (matches.length !== 1) throw new Error(`Expected one workflow step: ${stepName}`);
    const start = matches[0];
    const stepIndent = lines[start].search(/\S/);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() && lines[i].search(/\S/) <= stepIndent) {
            end = i;
            break;
        }
    }
    const runIndex = lines.findIndex(
        (line, index) => index > start && index < end && /^\s+run: \|[+-]?\s*$/.test(line),
    );
    if (runIndex < 0) throw new Error(`Expected literal Bash run block: ${stepName}`);
    const runIndent = lines[runIndex].search(/\S/);
    const body: string[] = [];
    for (let i = runIndex + 1; i < end; i++) {
        if (lines[i].trim() && lines[i].search(/\S/) <= runIndent) break;
        body.push(lines[i]);
    }
    const nonempty = body.filter((line) => line.trim());
    if (nonempty.length === 0) throw new Error(`Empty workflow run block: ${stepName}`);
    const indent = Math.min(...nonempty.map((line) => line.search(/\S/)));
    return `${body
        .map((line) => line.slice(indent))
        .join('\n')
        .trimEnd()}\n`;
}

const traceCommand = String.raw`
printf '%s\037' "$(basename "$0")" "$@" >> "$FIXTURE_TRACE"
printf '\n' >> "$FIXTURE_TRACE"
`;

const fakeDocker =
    `#!/bin/bash\nset -euo pipefail\n${traceCommand}\n` +
    String.raw`
if [[ "$1" == pull && "$2" == --quiet && "$#" == 3 ]]; then
    exit "$FIXTURE_PULL_EXIT"
fi
if [[ "$1" == image && "$2" == inspect && "$3" == --format && "$#" == 5 ]]; then
    [[ "$FIXTURE_INSPECT_EXIT" == 0 ]] || exit "$FIXTURE_INSPECT_EXIT"
    [[ "$4" == '{{index .Config.Labels "org.spmnacional.database-protocol"}}' ]] || exit 97
    case "$5" in
        "$FIXTURE_APP_IMAGE") printf '%s\n' "$FIXTURE_APP_LABEL" ;;
        "$FIXTURE_MIGRATOR_IMAGE") printf '%s\n' "$FIXTURE_MIGRATOR_LABEL" ;;
        "$FIXTURE_PREVIOUS_A_IMAGE") printf '%s\n' "$FIXTURE_PREVIOUS_A_LABEL" ;;
        "$FIXTURE_PREVIOUS_B_IMAGE") printf '%s\n' "$FIXTURE_PREVIOUS_B_LABEL" ;;
        *) exit 97 ;;
    esac
    exit 0
fi
exit 97
`;

const fakeGcloud =
    `#!/bin/bash\nset -euo pipefail\n${traceCommand}\n` +
    String.raw`
if [[ "$1" == run && "$2" == revisions && "$3" == describe ]]; then
    [[ "$FIXTURE_REVISION_EXIT" == 0 ]] || exit "$FIXTURE_REVISION_EXIT"
    case "$4" in
        fixture-live-a) printf '%s\n' "$FIXTURE_PREVIOUS_A_IMAGE" ;;
        fixture-live-b) printf '%s\n' "$FIXTURE_PREVIOUS_B_IMAGE" ;;
        *) exit 97 ;;
    esac
    exit 0
fi
if [[ "$1" == run && "$2" == jobs && "$3" == update ]]; then
    exit "$FIXTURE_JOB_UPDATE_EXIT"
fi
if [[ "$1" == run && "$2" == jobs && "$3" == execute ]]; then
    exit "$FIXTURE_SQL_EXIT"
fi
if [[ "$1" == run && "$2" == services && "$3" == update-traffic ]]; then
    exit 0
fi
exit 97
`;

export type WorkflowResult = {
    status: number | null;
    commands: string[][];
    githubOutput: string;
    stdout: string;
    stderr: string;
};

export function runWorkflowStep(
    stepName: string,
    overrides: Record<string, string> = {},
): WorkflowResult {
    const source = readFileSync(resolve('.github/workflows/deploy-gcp.yml'), 'utf8');
    const fixtureRoot = resolve(mkdtempSync(join(tmpdir(), 'spm-workflow-')));
    try {
        mkdirSync(join(fixtureRoot, 'bin'));
        writeFileSync(join(fixtureRoot, 'run.sh'), extractWorkflowRun(source, stepName), {
            mode: 0o600,
        });
        writeFileSync(join(fixtureRoot, 'bin', 'docker'), fakeDocker, { mode: 0o700 });
        writeFileSync(join(fixtureRoot, 'bin', 'gcloud'), fakeGcloud, { mode: 0o700 });
        writeFileSync(join(fixtureRoot, 'trace'), '', { mode: 0o600 });
        writeFileSync(join(fixtureRoot, 'output'), '', { mode: 0o600 });
        const env = {
            ...workflowFixture,
            ...overrides,
            GITHUB_OUTPUT: '/fixture/output',
            FIXTURE_TRACE: '/fixture/trace',
            PATH: '/fixture/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        };
        // No inherited host env, cloud auth directories, Docker socket or network enter the fixture.
        // Linux CI owns the temp files as the runner UID; dropping capabilities must not
        // depend on root bypassing their permissions. Windows bind mounts use the default user.
        const uid = process.getuid?.();
        const gid = process.getgid?.();
        const args = [
            'run',
            '--rm',
            '--pull',
            'never',
            '--network',
            'none',
            '--read-only',
            '--cap-drop',
            'ALL',
            '--security-opt',
            'no-new-privileges',
            ...(uid !== undefined && gid !== undefined ? ['--user', `${uid}:${gid}`] : []),
            '--mount',
            `type=bind,source=${fixtureRoot},target=/fixture`,
            ...Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
            '--entrypoint',
            '/bin/bash',
            'postgres:18.6-alpine',
            '-c',
            'chmod 700 /fixture/bin/docker /fixture/bin/gcloud && exec /bin/bash /fixture/run.sh',
        ];
        const result = spawnSync('docker', args, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
            maxBuffer: 256 * 1024,
        });
        if (result.error)
            throw new Error(`Isolated workflow fixture failed: ${result.error.message}`);
        if (result.status === null) throw new Error('Isolated workflow fixture did not finish.');
        return {
            status: result.status,
            commands: readFileSync(join(fixtureRoot, 'trace'), 'utf8')
                .split('\n')
                .filter(Boolean)
                .map((line) => line.split('\x1f').slice(0, -1)),
            githubOutput: readFileSync(join(fixtureRoot, 'output'), 'utf8'),
            stdout: result.stdout,
            stderr: result.stderr,
        };
    } finally {
        // Only the uniquely created fixture directory under the real temp root can be removed.
        if (
            dirname(fixtureRoot) !== resolve(tmpdir()) ||
            !/^spm-workflow-[A-Za-z0-9]{6}$/.test(basename(fixtureRoot)) ||
            !lstatSync(fixtureRoot).isDirectory() ||
            lstatSync(fixtureRoot).isSymbolicLink()
        )
            throw new Error('Refusing to remove an unexpected workflow fixture path.');
        rmSync(fixtureRoot, { recursive: true, force: true });
    }
}
