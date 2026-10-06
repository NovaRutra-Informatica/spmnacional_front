#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
source /opt/spm-hml/common.sh
require_root
exec 8>"$HML_ROOT/state/deploy.lock"
flock -sn 8 || exit 0
deployment_ready && in_hml_window || exit 0
exec 9>"$HML_ROOT/state/cron.lock"
flock -n 9 || exit 0

today=$(TZ=America/Sao_Paulo date +%Y%m%d)
hour=$(TZ=America/Sao_Paulo date +%H)
minute=$(TZ=America/Sao_Paulo date +%M)
header=$(mktemp "$HML_ROOT/state/.cron-header-XXXXXX")
trap 'rm -f "$header"' EXIT
python3 - "$header" <<'PY'
import os, sys
values = dict(line.rstrip('\n').split('=', 1) for line in open('/opt/spm-hml/generated/web.env') if '=' in line)
secret = values.get('CRON_SECRET', '')
if len(secret.encode()) < 32 or any(ord(c) < 32 for c in secret):
    raise SystemExit('Segredo operacional indisponível.')
with open(sys.argv[1], 'w', encoding='utf-8') as stream:
    stream.write('Authorization: Bearer ' + secret + '\n')
os.chmod(sys.argv[1], 0o600)
PY

call_cron() {
    # The response can include counts, but neither body nor request headers are logged.
    curl --fail --silent --show-error --max-time "${2:-75}" --request POST \
        --header "@$header" "http://127.0.0.1:3000/api/cron/$1" >/dev/null
}
cron_status=0
if [[ ${1:-} == init ]] || (( 10#$hour > 9 || 10#$minute >= 15 )); then
    if [[ ! -f "$HML_ROOT/state/retencao-$today" ]]; then
        if call_cron retencao; then
            touch "$HML_ROOT/state/retencao-$today"
        else
            cron_status=1
        fi
    fi
fi
# Durable email has its own credential-checked endpoint and scheduling budget.
# A retention failure must not suppress independent delivery intentions.
if [[ ${1:-} == init ]] || (( 10#$minute % 5 == 0 )); then
    if [[ ! -f "$HML_ROOT/state/notificacoes-$today-$hour-$minute" ]]; then
        if call_cron notificacoes 185; then
            touch "$HML_ROOT/state/notificacoes-$today-$hour-$minute"
        else
            cron_status=1
        fi
    fi
fi
if [[ ${1:-} == init ]] || (( 10#$minute <= 5 )); then
    if [[ ! -f "$HML_ROOT/state/agenda-$today-$hour" ]] \
        && grep -q '^GOOGLE_CALENDAR_ID=.' "$HML_ROOT/generated/web.env"; then
        call_cron agenda
        touch "$HML_ROOT/state/agenda-$today-$hour"
    fi
fi
if [[ $hour == 16 ]] && (( 10#$minute >= 45 )) \
    && [[ ! -f "$HML_ROOT/state/backup-$today" ]]; then
    bash "$HML_ROOT/backup.sh"
    touch "$HML_ROOT/state/backup-$today"
fi
# Markers contain no data; retain only a short operational history.
find "$HML_ROOT/state" -maxdepth 1 -type f \
    \( -name 'retencao-*' -o -name 'notificacoes-*' -o -name 'agenda-*' -o -name 'backup-*' \) -mtime +14 -delete
exit "$cron_status"
