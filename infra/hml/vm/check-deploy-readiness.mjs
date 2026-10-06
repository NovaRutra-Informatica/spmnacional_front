// Execute the production deploy in isolated Linux fixtures. Docker/Google/SQL
// calls inside the fixtures are mocks, and no application port is published.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = path.dirname(fileURLToPath(import.meta.url));
const deploy = fs.readFileSync(path.join(directory, 'deploy.sh'), 'utf8').replaceAll('\r\n', '\n');
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }

for (const scenario of ['delayed-ready', 'persistent-503', 'contract-blocked', 'old-app', 'old-migrator', 'stop-failed', 'still-running', 'status-failed']) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'spm-hml-readiness-check-'));
    try {
        fs.mkdirSync(path.join(temporary, 'state'));
        fs.mkdirSync(path.join(temporary, 'generated'));
        fs.writeFileSync(path.join(temporary, 'deploy.sh'), deploy);
        fs.writeFileSync(path.join(temporary, 'state', 'deployment-ready'), 'stale-marker');
        for (const name of ['compose.env', 'config.env', 'release.env', 'provision-runtime.mjs', 'preflight.mjs']) {
            fs.writeFileSync(path.join(temporary, name), 'synthetic\n');
        }
        fs.writeFileSync(path.join(temporary, 'gateway.sh'), '#!/bin/bash\necho evaluated >> /opt/spm-hml/state/gateway-calls\n');
        fs.writeFileSync(path.join(temporary, 'cron.sh'), '#!/bin/bash\necho evaluated >> /opt/spm-hml/state/cron-calls\n');
        fs.writeFileSync(path.join(temporary, 'common.sh'), `
set -Eeuo pipefail
HML_ROOT=/opt/spm-hml
require_root() { :; }
flock() { :; }
configuration_exists() { return 0; }
ready_signature() { printf '%s\\n' verified-signature; }
gcloud() { :; }
python3() {
    if [[ $* == *'configure.py'* ]]; then printf '%s\\n' configured >> "$HML_ROOT/state/configure-calls"; return 0; fi
    if [[ $* == *'services'* ]]; then cat >/dev/null; printf '%s\\n' "registry.example.invalid/$3@sha256:$(printf 'a%.0s' {1..64})"; else printf '%s\\n' registry.example.invalid; fi
}
docker() {
    if [[ $SCENARIO == old-app && $* == *'/web@'* || $SCENARIO == old-migrator && $* == *'/migrate@'* ]]; then printf '%s\\n' '<no value>'; else printf '%s\\n' scoped-rls-v1; fi
}
compose() {
    printf '%s\\n' "$*" >> "$HML_ROOT/state/compose-calls"
    if [[ $SCENARIO == stop-failed && $* == 'stop gateway web' ]]; then return 1; fi
    if [[ $* == 'ps --status running --services gateway web' ]]; then
        [[ $SCENARIO == status-failed ]] && return 1
        [[ $SCENARIO == still-running ]] && printf '%s\\n' gateway
        return 0
    fi
    if [[ $SCENARIO == contract-blocked && $* == *'check-migrations.mjs'* ]]; then return 1; fi
    if [[ $* == *'config --format json'* ]]; then printf '%s\\n' '{"services":{}}'; fi
    [[ $* == *'count-users'* ]] && printf '1'
    return 0
}
sleep() { SECONDS=$((SECONDS + 10)); }
curl() {
    if [[ $* == *'/api/health/ready'* ]]; then
        local count=0
        [[ -f "$HML_ROOT/state/ready-count" ]] && read -r count < "$HML_ROOT/state/ready-count"
        count=$((count + 1))
        printf '%s\\n' "$count" > "$HML_ROOT/state/ready-count"
        if [[ $SCENARIO == delayed-ready && $count -ge 4 ]]; then printf 200; else printf 503; fi
    else
        printf '%s\\n' "$*" >> "$HML_ROOT/state/other-http-calls"
    fi
    return 0
}
`);
        const result = spawnSync('docker', [
            'run', '--rm', '--pull=never', '--network=none', '--env', `SCENARIO=${scenario}`,
            '--mount', `type=bind,source=${temporary},target=/opt/spm-hml`,
            '--entrypoint', 'bash', 'postgres:18.6-alpine', '/opt/spm-hml/deploy.sh',
        ], { encoding: 'utf8', timeout: 30000 });
        const success = scenario === 'delayed-ready';
        check(result.status === (success ? 0 : 1), `Unexpected deploy result: ${result.stderr || result.error || ''}`);
        const calls = fs.readFileSync(path.join(temporary, 'state', 'compose-calls'), 'utf8');
        if (['stop-failed', 'still-running', 'status-failed'].includes(scenario)) {
            check(!fs.existsSync(path.join(temporary, 'state', 'configure-calls')), 'Stop must be confirmed before configuration changes.');
            check(!calls.includes('check-migrations.mjs') && !calls.match(/^run /gm), 'Stop failure must block every SQL/job execution.');
            check(!fs.existsSync(path.join(temporary, 'state', 'deployment-ready')), 'Unconfirmed stop cannot retain readiness.');
            check(!fs.existsSync(path.join(temporary, 'state', 'gateway-calls')), 'Unconfirmed stop cannot invoke the opening gate.');
            check(calls.trim().endsWith('stop gateway'), 'Stop failure must attempt to keep the proxy stopped.');
            continue;
        }
        check(calls.includes('ps --status running --services gateway web'), 'Deployment must verify actual stopped service status.');
        check(calls.match(/^--profile \* config --format json$/gm)?.length === (scenario === 'old-app' ? 1 : 2), 'Every immutable image inspection must resolve all Compose profiles, including migrate jobs.');
        check(!calls.match(/^config --format json$/gm), 'Image verification must never omit profiled migration services.');
        if (['contract-blocked', 'old-app', 'old-migrator'].includes(scenario)) {
            check(!calls.match(/^run --rm --no-deps migrate$/gm), 'Incompatible pending migration cannot run.');
            check(!fs.existsSync(path.join(temporary, 'state', 'deployment-ready')), 'Blocked contract cannot become ready.');
            check(!fs.existsSync(path.join(temporary, 'state', 'gateway-calls')), 'Blocked contract cannot expose the site.');
            if (scenario !== 'contract-blocked') check(!calls.includes('check-migrations.mjs'), 'Old image must be blocked even before the migration guard.');
            continue;
        }
        check(calls.includes('--app-protocol=scoped-rls-v1'), 'Only the verified immutable image capability may reach the SQL guard.');
        check(calls.match(/^run --rm --no-deps migrate$/gm)?.length === 1, 'Readiness retries must never repeat migration execution.');
        const marker = path.join(temporary, 'state', 'deployment-ready');
        const gatewayCalls = path.join(temporary, 'state', 'gateway-calls');
        if (success) {
            check(Number(fs.readFileSync(path.join(temporary, 'state', 'ready-count'), 'utf8')) === 4, 'Deploy must wait across three 503 responses until HTTP 200.');
            check(fs.readFileSync(marker, 'utf8').trim() === 'verified-signature', 'Only successful readiness may create the new access marker.');
            check(fs.existsSync(gatewayCalls), 'Successful deploy must return control to the time gate.');
        } else {
            check(!fs.existsSync(marker), 'Persistent 503 must leave no access marker.');
            check(!fs.existsSync(gatewayCalls), 'Persistent 503 cannot invoke the opening gate.');
            check(calls.trim().endsWith('stop gateway'), 'Failure must explicitly keep the proxy stopped.');
            check(result.stderr.includes('120s'), 'Failed readiness must report the bounded timeout.');
        }
    } finally {
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(temporary).startsWith('spm-hml-readiness-check-'));
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}
console.log(`${checks} deploy readiness checks passed; no GCP, migrations or application ports were used.`);
