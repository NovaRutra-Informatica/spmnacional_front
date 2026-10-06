#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
source /opt/spm-hml/common.sh
require_root
exec 8>"$HML_ROOT/state/deploy.lock"
flock -sn 8 || { printf '%s\n' 'Deploy em execução; backup adiado.' >&2; exit 1; }
deployment_ready || { printf '%s\n' 'HML não está pronta para backup.' >&2; exit 1; }
exec 9>"$HML_ROOT/state/backup.lock"
flock -n 9 || exit 0

suffix=$(cat /proc/sys/kernel/random/uuid)
dump="$HML_ROOT/backups/pending.dump"
partial="$HML_ROOT/backups/pending.partial"
header=$(mktemp "$HML_ROOT/backups/.header-XXXXXX")
cleanup() { rm -f "$header"; }
trap cleanup EXIT

if [[ ! -s "$dump" ]]; then
    rm -f "$dump"
    # PGPASSWORD is inherited only inside the DB process, never an argv value.
    # One fixed partial path is reused after pg_dump failures instead of accumulating dumps.
    compose exec -T db sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -h /var/run/postgresql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$partial"
    chmod 0600 "$partial"
    compose exec -T db pg_restore --list < "$partial" >/dev/null
    mv "$partial" "$dump"
else
    # Retry an existing completed dump before capturing any new snapshot.
    rm -f "$partial"
fi
[[ -s "$dump" ]] || { printf '%s\n' 'Backup PostgreSQL vazio.' >&2; exit 1; }
compose exec -T db pg_restore --list < "$dump" >/dev/null
stamp=$(date -u -r "$dump" +%Y%m%dT%H%M%SZ)
python3 - "$header" <<'PY'
import os, subprocess, sys
result = subprocess.run(['gcloud', 'auth', 'print-access-token', '--quiet'],
                        check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
token = result.stdout.strip()
if not token or any(ord(c) < 32 for c in token):
    raise SystemExit('Token de backup indisponível.')
with open(sys.argv[1], 'w', encoding='utf-8') as stream:
    stream.write('Authorization: Bearer ' + token + '\n')
os.chmod(sys.argv[1], 0o600)
PY
upload_url=$(python3 - "$stamp" "$suffix" <<'PY'
import json, sys
from urllib.parse import urlencode, quote
d = json.load(open('/opt/spm-hml/metadata.json'))
name = 'postgres/' + sys.argv[1][:6] + '/spmnacional-' + sys.argv[1] + '-' + sys.argv[2] + '.dump'
print('https://storage.googleapis.com/upload/storage/v1/b/' + quote(d['hml-backups-bucket'], safe='')
      + '/o?' + urlencode({'uploadType': 'media', 'name': name, 'ifGenerationMatch': '0'}))
PY
)
# Create a unique object with a generation precondition: objectCreator is sufficient.
# The bearer header is supplied through a root-only file, not a process argument.
curl --fail --silent --show-error --max-time 240 --request POST \
    --header "@$header" --header 'Content-Type: application/octet-stream' \
    --upload-file "$dump" "$upload_url" >/dev/null
rm -f "$dump"
printf '%s\n' 'Backup PostgreSQL enviado ao bucket privado; restauração ainda deve ser ensaiada.'
