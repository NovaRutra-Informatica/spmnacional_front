// Local checks only: Linux fixtures have no network, real Docker calls are mocked
// inside those fixtures, and Caddy is adapted without starting a server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(directory, 'tls-bootstrap.sh'), 'utf8').replaceAll('\r\n', '\n');
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function docker(args, label, env = process.env) {
    const result = spawnSync('docker', args, { encoding: 'utf8', env, timeout: 30000 });
    assert.equal(result.status, 0, `${label}: ${result.stderr || result.error || 'failed'}`);
    return result.stdout;
}

const adapted = JSON.parse(docker([
    'run', '--rm', '--pull=never', '--network=none', '--env', 'HML_DOMAIN=spm-hml.example.invalid',
    '--mount', `type=bind,source=${directory},target=/hml,readonly`,
    'caddy:2-alpine', 'caddy', 'adapt', '--config', '/hml/Caddyfile.tls-bootstrap', '--adapter', 'caddyfile',
], 'Caddy adaptation'));
const handlers = [];
function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (value.handler) handlers.push(value);
    Object.values(value).forEach(walk);
}
walk(adapted);
check(handlers.some((handler) => handler.handler === 'static_response' && handler.status_code === 503), 'A normal request must receive static 503.');
check(handlers.every((handler) => handler.handler !== 'reverse_proxy'), 'No application proxy may exist.');
check(handlers.some((handler) => handler.handler === 'headers' && handler.response?.set?.['X-Robots-Tag']?.includes('noindex, nofollow, noarchive')), 'TLS responder must prevent indexing.');

const compose = JSON.parse(docker([
    'compose', '--project-name', 'spm-hml-tls-bootstrap-check', '-f', path.join(directory, 'docker-compose.tls-bootstrap.yml'),
    'config', '--format', 'json',
], 'Compose render', { ...process.env, HML_DOMAIN: 'spm-hml.example.invalid', CADDY_IMAGE: 'caddy:2-alpine' }));
check(Object.keys(compose.services).join() === 'tls-bootstrap', 'Only the static TLS service may be present.');
check(compose.volumes.caddy_data.external && compose.volumes.caddy_data.name === 'spm-hml_caddy_data', 'Existing certificate data volume must be reused.');
check(compose.volumes.caddy_config.external && compose.volumes.caddy_config.name === 'spm-hml_caddy_config', 'Existing Caddy config volume must be reused.');
check(compose.services['tls-bootstrap'].restart === 'no', 'The responder cannot restart outside operator control.');
check(compose.services['tls-bootstrap'].command.slice(0, 2).join() === 'timeout,360', 'A hard container lifetime must survive session loss.');
check(Object.keys(compose.services['tls-bootstrap'].environment).join() === 'HML_DOMAIN', 'The TLS responder must receive no app/Basic Auth secrets.');
const commandsOnly = script.replace(/^\s*#.*$/gm, '');
check(!commandsOnly.includes('--insecure') && !/curl[^\n]*\s-k(?:\s|$)/.test(commandsOnly), 'Probe cannot bypass certificate trust.');

for (const scenario of ['ready', 'not-ready', 'inside-window', 'busy-deploy', 'busy-gateway', 'bad-tls', 'bad-status']) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'spm-hml-tls-check-'));
    try {
        fs.mkdirSync(path.join(temporary, 'state'));
        fs.writeFileSync(path.join(temporary, 'tls-bootstrap.sh'), script);
        fs.writeFileSync(path.join(temporary, 'config.env'), 'HML_DOMAIN=spm-hml.example.invalid\n');
        fs.writeFileSync(path.join(temporary, 'compose.env'), 'CADDY_IMAGE=caddy:2-alpine\n');
        fs.writeFileSync(path.join(temporary, 'state', 'deployment-ready'), 'unchanged-marker');
        fs.writeFileSync(path.join(temporary, 'gateway.sh'), '#!/bin/bash\necho gate-reviewed >> /opt/spm-hml/state/gate-calls\n');
        fs.writeFileSync(path.join(temporary, 'common.sh'), `
set -Eeuo pipefail
HML_ROOT=/opt/spm-hml
require_root() { :; }
deployment_ready() { [[ $SCENARIO != not-ready ]]; }
in_hml_window() { [[ $SCENARIO == inside-window ]]; }
flock() {
    [[ $SCENARIO == busy-deploy && $* == '-n 8' ]] && return 1
    [[ $SCENARIO == busy-gateway && $* == '-n 9' ]] && return 1
    return 0
}
compose() { printf '%s\\n' "$*" >> "$HML_ROOT/state/app-compose-calls"; }
docker() { printf '%s\\n' "$*" >> "$HML_ROOT/state/docker-calls"; }
sleep() { SECONDS=$((SECONDS + 40)); }
python3() { cat >/dev/null; printf '%s\\n' 'spm-hml.example.invalid'; }
curl() {
    printf '%s\\n' "$*" >> "$HML_ROOT/state/curl-calls"
    [[ $* == *'/api/health/ready'* ]] && return 0
    [[ $SCENARIO == bad-tls ]] && return 60
    printf 'HML fora do horario.' > "$HML_ROOT/state/tls-bootstrap.body"
    printf 'X-Robots-Tag: noindex, nofollow, noarchive\\r\\nCache-Control: no-store\\r\\n' > "$HML_ROOT/state/tls-bootstrap.headers"
    if [[ $SCENARIO == bad-status ]]; then printf 200; else printf 503; fi
}
`);
        const result = spawnSync('docker', [
            'run', '--rm', '--pull=never', '--network=none', '--env', `SCENARIO=${scenario}`,
            '--mount', `type=bind,source=${temporary},target=/opt/spm-hml`,
            '--entrypoint', 'bash', 'postgres:18.6-alpine',
            '/opt/spm-hml/tls-bootstrap.sh', '--timeout', '30', '--hold-seconds', '0',
        ], { encoding: 'utf8', timeout: 30000 });
        check(result.status === (scenario === 'ready' ? 0 : 1), `Unexpected exit for ${scenario}: ${result.stderr || result.error || ''}`);
        check(fs.readFileSync(path.join(temporary, 'state', 'deployment-ready'), 'utf8') === 'unchanged-marker', 'The deployment marker must remain unchanged.');
        const callsFile = path.join(temporary, 'state', 'docker-calls');
        const calls = fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8') : '';
        if (['not-ready', 'inside-window', 'busy-deploy', 'busy-gateway'].includes(scenario)) {
            check(!calls, 'Failed readiness/window/lock check cannot bind any port.');
        } else {
            check(calls.includes('up -d --no-deps --pull never tls-bootstrap'), 'TLS service should be started only after checks pass.');
            check(calls.match(/down --timeout 5/g)?.length === 2, 'Bootstrap must clean up its own project after start/failure.');
            check(fs.readFileSync(path.join(temporary, 'state', 'gate-calls'), 'utf8').includes('gate-reviewed'), 'Cleanup must restore the normal gate.');
            check(fs.readFileSync(path.join(temporary, 'state', 'app-compose-calls'), 'utf8').trim() === 'stop -t 1 gateway', 'Warmup cannot start the regular application gateway.');
        }
    } finally {
        // Verify the absolute target remains inside the intended temporary folder
        // before recursive deletion on Windows.
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(temporary).startsWith('spm-hml-tls-check-'));
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}
console.log(`${checks} TLS bootstrap checks passed; no GCP, public ports or ACME calls were used.`);
