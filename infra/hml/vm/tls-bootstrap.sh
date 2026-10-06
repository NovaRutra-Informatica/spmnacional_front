#!/usr/bin/env bash
# Acquire/verify TLS outside the HML window while exposing only a static 503.
set -Eeuo pipefail
umask 077
source /opt/spm-hml/common.sh
require_root

timeout_seconds=180
hold_seconds=60
while (( $# )); do
    case "$1" in
        --timeout) [[ $# -ge 2 ]] || exit 2; timeout_seconds=$2; shift 2 ;;
        --hold-seconds) [[ $# -ge 2 ]] || exit 2; hold_seconds=$2; shift 2 ;;
        *) printf '%s\n' 'Uso: tls-bootstrap.sh [--timeout 30..240] [--hold-seconds 0..90]' >&2; exit 2 ;;
    esac
done
[[ $timeout_seconds =~ ^[0-9]+$ && $hold_seconds =~ ^[0-9]+$ ]] || exit 2
(( 10#$timeout_seconds >= 30 && 10#$timeout_seconds <= 240 && 10#$hold_seconds <= 90 )) || exit 2
timeout_seconds=$((10#$timeout_seconds))
hold_seconds=$((10#$hold_seconds))

exec 8>"$HML_ROOT/state/deploy.lock"
flock -n 8 || { printf '%s\n' 'Deploy HML em andamento; bootstrap TLS recusado.' >&2; exit 1; }
exec 9>"$HML_ROOT/state/gateway.lock"
flock -n 9 || { printf '%s\n' 'Gateway HML em avaliacao; bootstrap TLS recusado.' >&2; exit 1; }
deployment_ready || { printf '%s\n' 'Bootstrap TLS exige deploy pronto e assinatura valida neste boot.' >&2; exit 1; }
if in_hml_window; then
    printf '%s\n' 'Bootstrap TLS permitido somente fora da janela HML.' >&2
    exit 1
fi
curl --fail --silent --max-time 8 http://127.0.0.1:3000/api/health/ready >/dev/null

HML_DOMAIN=$(python3 - "$HML_ROOT/config.env" <<'PY'
import pathlib, re, sys
values = {}
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        values[key.strip()] = value
domain = values.get('HML_DOMAIN', '')
if not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}', domain):
    raise SystemExit('Hostname HML invalido.')
print(domain)
PY
)
export HML_DOMAIN

tls_compose() {
    docker compose --project-name spm-hml-tls-bootstrap \
        --project-directory "$HML_ROOT" --env-file "$HML_ROOT/compose.env" \
        -f "$HML_ROOT/docker-compose.tls-bootstrap.yml" "$@"
}

cleanup() {
    local status=$?
    trap - EXIT
    # Never remove the external Caddy volumes, deployment-ready marker or data.
    if ! tls_compose down --timeout 5 >/dev/null 2>&1; then
        printf '%s\n' 'Limpeza TLS falhou; o contêiner 503 expira automaticamente em 360s.' >&2
        status=1
    fi
    flock -u 9
    flock -u 8
    if ! bash "$HML_ROOT/gateway.sh"; then status=1; fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The regular proxy remains stopped while these exclusive locks are held.
compose stop -t 1 gateway >/dev/null
tls_compose config --quiet
docker volume inspect spm-hml_caddy_data spm-hml_caddy_config >/dev/null
tls_compose down --timeout 5 >/dev/null 2>&1
tls_compose up -d --no-deps --pull never tls-bootstrap >/dev/null

probe_tls() {
    local code headers body
    headers="$HML_ROOT/state/tls-bootstrap.headers"
    body="$HML_ROOT/state/tls-bootstrap.body"
    # No -k/--insecure: verify public CA trust, validity and the real hostname.
    code=$(curl --silent --max-time 8 --resolve "$HML_DOMAIN:443:127.0.0.1" \
        --dump-header "$headers" --output "$body" --write-out '%{http_code}' \
        "https://$HML_DOMAIN/tls-readiness") || return 1
    [[ $code == 503 ]] && [[ $(cat "$body") == 'HML fora do horario.' ]] \
        && grep -Eiq '^x-robots-tag: noindex, nofollow, noarchive' "$headers" \
        && grep -Eiq '^cache-control: no-store' "$headers"
}

deadline=$((SECONDS + timeout_seconds))
verified=0
while (( SECONDS < deadline )); do
    if in_hml_window; then
        printf '%s\n' 'A janela HML começou; encerrando bootstrap e devolvendo controle ao gate.' >&2
        exit 1
    fi
    if probe_tls; then verified=1; break; fi
    sleep 2
done
if (( ! verified )); then
    printf '%s\n' 'TLS nao confirmado dentro do limite. Confira DNS, portas ACME e erros Caddy; site permanece fechado.' >&2
    exit 1
fi
printf 'TLS valido para %s, HTTPS 503 e noindex confirmados. Janela de verificacao externa: %ss.\n' "$HML_DOMAIN" "$hold_seconds"
deadline=$((SECONDS + hold_seconds))
while (( SECONDS < deadline )); do
    in_hml_window && exit 1
    sleep 1
done
rm -f "$HML_ROOT/state/tls-bootstrap.headers" "$HML_ROOT/state/tls-bootstrap.body"
printf '%s\n' 'Bootstrap TLS concluido; certificados preservados e proxy normal sob controle do gate.'
