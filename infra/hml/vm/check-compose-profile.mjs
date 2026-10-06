// Real Compose configuration resolution only: no start, pull, image or SQL operation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporary = mkdtempSync(path.join(tmpdir(), 'spm-compose-profiles-check-'));
const fixture = path.join(temporary, 'compose.yml');
const webImage = `registry.example.invalid/web@sha256:${'a'.repeat(64)}`;
const migrateImage = `registry.example.invalid/migrate@sha256:${'b'.repeat(64)}`;
try {
    writeFileSync(fixture, [
        'name: spm-compose-profile-check',
        'services:',
        '  web:',
        `    image: ${webImage}`,
        '    network_mode: none',
        '  migrate:',
        `    image: ${migrateImage}`,
        '    profiles: [jobs]',
        '    network_mode: none',
        '',
    ].join('\n'), { mode: 0o600 });
    const config = (allProfiles) => {
        const result = spawnSync('docker', [
            'compose', '--project-directory', temporary, '--file', fixture,
            ...(allProfiles ? ['--profile', '*'] : []), 'config', '--format', 'json',
        ], { encoding: 'utf8', windowsHide: true, timeout: 15000, env: {
            ...process.env, COMPOSE_PROFILES: '', COMPOSE_ENV_FILES: '', COMPOSE_DISABLE_ENV_FILE: 'true',
        } });
        assert.equal(result.status, 0, 'The synthetic Compose config must resolve without starting or pulling anything.');
        return JSON.parse(result.stdout);
    };
    const defaultConfig = config(false);
    assert.equal(defaultConfig.services.web.image, webImage);
    assert.equal(defaultConfig.services.migrate, undefined, 'Inactive jobs must reproduce the real missing migrate service.');
    const allProfiles = config(true);
    assert.equal(allProfiles.services.web.image, webImage);
    assert.equal(allProfiles.services.migrate.image, migrateImage, 'The production all-profiles config must expose the immutable migrator.');
    assert.deepEqual(allProfiles.services.migrate.profiles, ['jobs']);
    console.log('5 real Compose profile checks passed; config only, no start/pull/GCP/SQL.');
} finally {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
    assert.ok(path.basename(temporary).startsWith('spm-compose-profiles-check-'));
    rmSync(temporary, { recursive: true, force: true });
}
