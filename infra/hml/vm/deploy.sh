#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
source /opt/spm-hml/common.sh
require_root
MODE=online
if [[ ${1:-} == --maintenance && $# -eq 1 ]]; then
    [[ ${SPM_MAINTENANCE_CONFIRMED:-} == true && ${SPM_DATABASE_BACKUP_VERIFIED:-} == true ]] || {
        printf '%s\n' 'Manutenção exige janela confirmada e backup restaurado/verificado pelo operador.' >&2
        exit 1
    }
    MODE=maintenance
elif [[ $# -gt 1 || ( $# -eq 1 && $1 != --boot ) ]]; then
    printf '%s\n' 'Uso: deploy.sh [--boot|--maintenance]' >&2
    exit 1
fi
exec 9>"$HML_ROOT/state/deploy.lock"
flock -n 9 || { printf '%s\n' 'Já existe um deploy HML em execução.' >&2; exit 1; }

# Remove the access marker before any migration or credential change.
rm -f "$HML_ROOT/state/deployment-ready"
fail_closed() {
    rm -f "$HML_ROOT/state/deployment-ready"
    if [[ -s "$HML_ROOT/compose.env" ]]; then
        if ! compose stop gateway >/dev/null 2>&1; then
            printf '%s\n' 'Falha ao parar o proxy; confirme a parada antes de continuar.' >&2
        fi
    fi
    printf '%s\n' 'Deploy HML não concluído; marcador de prontidão removido.' >&2
}
trap fail_closed ERR
stop_running_release() {
    local running
    compose stop gateway web >/dev/null 2>&1
    running=$(compose ps --status running --services gateway web)
    if [[ -n $running ]]; then
        printf '%s\n' 'Gateway/web ainda em execução; configuração e migração bloqueadas.' >&2
        return 1
    fi
}
if [[ -s "$HML_ROOT/compose.env" ]]; then stop_running_release; fi
if ! configuration_exists; then
    if [[ ${1:-} == --boot ]]; then
        printf '%s\n' 'Release/configuração ainda ausentes; HML permanece fechada.'
        exit 0
    fi
    printf '%s\n' 'Instale release.env, config.env e o pacote operacional em /opt/spm-hml.' >&2
    exit 1
fi
chmod 0600 "$HML_ROOT/release.env" "$HML_ROOT/config.env"
# Non-root job containers must read their individual bind-mounted code files.
chmod 0644 "$HML_ROOT/provision-runtime.mjs" "$HML_ROOT/preflight.mjs"
python3 "$HML_ROOT/configure.py"
registry=$(python3 -c 'import json; d=json.load(open("/opt/spm-hml/metadata.json")); print(d["hml-region"]+"-docker.pkg.dev")')
gcloud auth configure-docker "$registry" --quiet >/dev/null 2>&1
compose --profile '*' config --quiet
compose pull --quiet db web migrate provision preflight bootstrap gateway
# Inspect the actual images pinned by digest, never an environment capability
# assertion. A compatible new migrator cannot vouch for an incompatible old app.
verified_database_protocol() {
    local service=$1 image label
    image=$(compose --profile '*' config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"][sys.argv[1]]["image"])' "$service")
    [[ $image =~ @sha256:[a-f0-9]{64}$ ]] || return 1
    label=$(docker image inspect --format '{{index .Config.Labels "org.spmnacional.database-protocol"}}' "$image")
    [[ $label == scoped-rls-v1 ]] || {
        printf '%s\n' 'Imagem imutável incompatível com o protocolo do banco; deploy/rollback bloqueado.' >&2
        return 1
    }
    printf '%s\n' "$label"
}
app_protocol=$(verified_database_protocol web)
migrator_protocol=$(verified_database_protocol migrate)
[[ $app_protocol == "$migrator_protocol" ]]
# Preflight uses the web environment; it does not have the SQL owner credential.
compose run --rm --no-deps preflight
compose up -d --wait --wait-timeout 180 db
# The guard is read-only. Online releases cannot break the running/rollback code.
if [[ $MODE == maintenance ]]; then
    compose run --rm --no-deps --env SPM_MAINTENANCE_CONFIRMED=true --env SPM_DATABASE_BACKUP_VERIFIED=true \
        migrate node scripts/lib/check-migrations.mjs --mode=maintenance "--app-protocol=$app_protocol"
else
    compose run --rm --no-deps migrate node scripts/lib/check-migrations.mjs --mode=online "--app-protocol=$app_protocol"
fi
# A migration is attempted once. Diagnosing a failed migration requires the operator.
compose run --rm --no-deps migrate
compose run --rm --no-deps provision
user_count=$(compose run --rm --no-deps provision node /app/hml/provision-runtime.mjs count-users)
if [[ $user_count == 0 ]]; then
    compose run --rm --no-deps bootstrap
fi
compose up -d --no-deps --wait --wait-timeout 180 web
# Liveness can become healthy before the first cold runtime database query.
# Wait for actual HTTP 200, without retrying migrations or opening the gateway.
wait_for_web_readiness() {
    local deadline=$((SECONDS + 120)) code remaining attempt_timeout
    while (( SECONDS < deadline )); do
        remaining=$((deadline - SECONDS))
        attempt_timeout=8
        if (( remaining < attempt_timeout )); then attempt_timeout=$remaining; fi
        code=$(curl --silent --max-time "$attempt_timeout" --output /dev/null \
            --write-out '%{http_code}' http://127.0.0.1:3000/api/health/ready) || code=''
        [[ $code == 200 ]] && return 0
        if (( SECONDS + 2 >= deadline )); then break; fi
        sleep 2
    done
    printf '%s\n' 'Readiness nao confirmou HTTP 200 em ate 120s; acesso externo permanece fechado.' >&2
    return 1
}
wait_for_web_readiness
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3000/atendente >/dev/null
# Validate Caddy before marking the release ready; this does not bind public ports.
compose run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile >/dev/null
ready_signature > "$HML_ROOT/state/deployment-ready"
chmod 0600 "$HML_ROOT/state/deployment-ready"
# The gateway/cron take a shared deploy lock. All changes are complete before release.
flock -u 9
bash "$HML_ROOT/gateway.sh"
bash "$HML_ROOT/cron.sh" init
printf '%s\n' 'Release HML pronta. Site público na janela Brasília; painel com login Google Workspace.'
