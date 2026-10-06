/** Gitleaks is installed from its checksum-verified official release by CI.
 * This script never prints secret payloads or reads ignored .env/private files.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyScanTree, regularScanFile, scanReportPath } from './lib/security-scan-tree.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--history'))
    throw new Error('Use only --history for a full Git history scan.');
const history = args[0] === '--history';
const binary = process.env.GITLEAKS_BIN || 'gitleaks';
const root = process.cwd();
const configuration = regularScanFile(root, '.gitleaks.toml');
let temporary;
try {
    let destination = root;
    if (!history) {
        const inventory = spawnSync(
            'git',
            ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
            { encoding: 'utf8', cwd: root },
        );
        if (inventory.error || inventory.status !== 0)
            throw new Error('Unable to inventory repository files.');
        temporary = mkdtempSync(path.join(tmpdir(), 'spm-secret-scan-'));
        const count = copyScanTree(root, temporary, inventory.stdout.split('\0').filter(Boolean));
        console.log(`Scanning ${count} non-ignored repository files.`);
        destination = temporary;
    }
    const report = scanReportPath(
        root,
        `tmp/${history ? 'history-secrets-redacted.json' : 'working-tree-secrets-redacted.json'}`,
    );
    const command = [
        history ? 'git' : 'dir',
        '--redact=100',
        '--no-banner',
        `--config=${configuration}`,
        '--report-format=json',
        `--report-path=${report}`,
        ...(history ? ['--log-opts=--all --no-textconv'] : []),
        destination,
    ];
    const result = spawnSync(binary, command, { stdio: 'inherit', cwd: root });
    if (result.error)
        throw new Error('Install the checksum-verified Gitleaks release before scanning.');
    process.exitCode = result.status ?? 1;
} finally {
    if (
        temporary &&
        path.dirname(temporary) === path.resolve(tmpdir()) &&
        path.basename(temporary).startsWith('spm-secret-scan-')
    )
        rmSync(temporary, { recursive: true, force: true });
}
