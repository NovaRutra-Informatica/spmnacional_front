/** Explicit executable regression smoke. All payloads are public synthetic fixtures. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyScanTree, regularScanFile, scanReportPath } from './lib/security-scan-tree.mjs';

const root = process.cwd();
const configuration = regularScanFile(root, '.gitleaks.toml');
const localBinary = path.join(root, 'tmp/secret-tools/gitleaks.exe');
const binary = process.env.GITLEAKS_BIN || (existsSync(localBinary) ? localBinary : 'gitleaks');
const allowedUuid = 'f6623d88-a368-4aef-9aa3-cb32e376c490';
const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const differentSynthetic = Array.from(
    { length: 40 },
    (_, i) => alphabet[(i * 17 + 11) % alphabet.length],
).join('');
const reports = [];
const temporaryParent = path.dirname(scanReportPath(root, 'tmp/smoke-reserved.json'));
const fixtureRoot = mkdtempSync(path.join(temporaryParent, 'gitleaks-smoke-'));

function fixture(relative, entries) {
    const directory = path.join(fixtureRoot, relative);
    mkdirSync(directory);
    for (const [file, payload] of Object.entries(entries)) {
        const target = scanReportPath(directory, file);
        writeFileSync(target, payload);
    }
    return directory;
}

function scan(name, directory, expectedFindings) {
    const report = path.join(fixtureRoot, `${name}.json`);
    const result = spawnSync(
        binary,
        [
            'dir',
            directory,
            '--redact=100',
            '--no-banner',
            '--log-level=error',
            `--config=${configuration}`,
            '--report-format=json',
            `--report-path=${report}`,
        ],
        { encoding: 'utf8', cwd: fixtureRoot, timeout: 30000 },
    );
    if (result.error || ![0, 1].includes(result.status))
        throw new Error(`Synthetic smoke failed at ${name}.`);
    const findings = JSON.parse(readFileSync(report, 'utf8'));
    if (findings.length !== expectedFindings || result.status !== (expectedFindings ? 1 : 0)) {
        throw new Error(
            `Synthetic smoke finding count mismatch at ${name}: expected ${expectedFindings}, actual ${findings.length}, exit ${result.status}.`,
        );
    }
    reports.push({ check: name, status: 'pass', findings: findings.length });
}

try {
    const assignment = (value) => `export const api_key = '${value}';\n`;
    const allowed = fixture('allowed', {
        'tests/security-data/contact.test.ts': assignment(allowedUuid),
        'tests/security-data/contact-idempotency.test.ts': assignment(allowedUuid),
    });
    scan('exact-fixture-allowlist', allowed, 0);
    scan(
        'same-value-outside-allowlist',
        fixture('outside', { 'app/api/fixture.ts': assignment(allowedUuid) }),
        1,
    );
    scan(
        'other-value-control',
        fixture('other-control', { 'app/api/fixture.ts': assignment(differentSynthetic) }),
        1,
    );
    scan(
        'different-secret-in-test-path',
        fixture('other-secret', {
            'tests/security-data/contact.test.ts': assignment(differentSynthetic),
        }),
        1,
    );
    const rscPath = 'publicacoes/blog/41a-semana-do-migrante-moradia-digna/__next._tree.txt';
    scan(
        'exact-public-rsc-key',
        fixture('public-rsc-key', {
            [rscPath]: JSON.stringify({ ['k' + 'ey']: '41a-semana-do-migrante-moradia-digna' }),
        }),
        0,
    );
    scan(
        'other-secret-in-rsc-path',
        fixture('public-rsc-secret', {
            [rscPath]: assignment(differentSynthetic),
        }),
        1,
    );
    scan(
        'public-slug-outside-rsc-path',
        fixture('public-slug-control', {
            'app/api/fixture.ts': assignment('41a-semana-do-migrante-moradia-digna'),
        }),
        1,
    );

    // Unborn disposable Git repository: no commits, source refs, remote or credentials.
    const inventorySource = fixture('inventory-source', {
        '.gitignore': '.env\ntracked.env\n',
        '.env': assignment(differentSynthetic),
        'tracked.env': assignment(differentSynthetic),
    });
    for (const args of [
        ['init', '--quiet'],
        ['add', '--force', 'tracked.env'],
    ]) {
        const result = spawnSync('git', args, {
            cwd: inventorySource,
            encoding: 'utf8',
            timeout: 10000,
        });
        if (result.error || result.status !== 0)
            throw new Error('Synthetic inventory setup failed.');
    }
    const inventory = spawnSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        { cwd: inventorySource, encoding: 'utf8', timeout: 10000 },
    );
    if (inventory.error || inventory.status !== 0) throw new Error('Synthetic inventory failed.');
    const scanDirectory = fixture('inventory-scan', {});
    const copied = copyScanTree(
        inventorySource,
        scanDirectory,
        inventory.stdout.split('\0').filter(Boolean),
    );
    if (
        copied !== 2 ||
        existsSync(path.join(scanDirectory, '.env')) ||
        !existsSync(path.join(scanDirectory, 'tracked.env'))
    )
        throw new Error('Synthetic inventory boundary failed.');
    scan('tracked-env-only', scanDirectory, 1);
    reports.push({ check: 'ignored-env-excluded', status: 'pass', files: copied });
    console.log(JSON.stringify({ status: 'pass', checks: reports }));
} catch (error) {
    // Do not emit child stdout/stderr, reports or fixture values, even on failure.
    console.error(error instanceof Error ? error.message : 'Synthetic security smoke failed.');
    process.exitCode = 1;
} finally {
    if (
        path.dirname(fixtureRoot) === temporaryParent &&
        path.basename(fixtureRoot).startsWith('gitleaks-smoke-')
    )
        rmSync(fixtureRoot, { recursive: true, force: true });
}
