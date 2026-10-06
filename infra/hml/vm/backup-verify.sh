#!/usr/bin/env bash
# Local restore proof before the contract migration; compatible with old common.sh.
set -Eeuo pipefail
umask 077
source /opt/spm-hml/common.sh
require_root
[[ $# -eq 0 ]] || { printf '%s\n' 'Uso: sudo bash /opt/spm-hml/backup-verify.sh' >&2; exit 1; }
HELPER="$HML_ROOT/backup-verify.py"
python3 "$HELPER" identity
exec 8>"$HML_ROOT/state/deploy.lock"
flock -w 30 -x 8 || { printf '%s\n' 'Operação HML em execução; backup não iniciou.' >&2; exit 1; }
exec 9>"$HML_ROOT/state/backup.lock"
flock -n -x 9 || { printf '%s\n' 'Outro backup está em execução.' >&2; exit 1; }
# Old readiness signatures do not include operational scripts: invalidate first.
rm -f "$HML_ROOT/state/deployment-ready"
value=$(python3 "$HELPER" prepare)
json_value() { python3 -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }
directory=$(json_value directory <<< "$value")
token=$(json_value token <<< "$value")
temporary_database=$(json_value temporary_database <<< "$value")
[[ $token =~ ^[a-f0-9]{32}$ && $temporary_database == "spm_verify_$token" ]]
created=false
removed=false
temporary_oid=''
marker="SPM backup verification:$token"
log="$directory/operations.log"
touch "$log"

db_sql() {
    local database=$1
    [[ $database == spmnacional || $database == "$temporary_database" ]] || return 1
    # No password/connection URL on argv, and never inherit a caller's PGOPTIONS.
    compose exec -T db sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; export PGOPTIONS="-c statement_timeout=180000 -c lock_timeout=5000"; exec psql -X -q -A -t -v ON_ERROR_STOP=1 -h /var/run/postgresql -U "$POSTGRES_USER" -d "$1"' sh "$database" 2>> "$log"
}
remove_temporary_database() {
    [[ $created == true && $removed == false && $temporary_oid =~ ^[0-9]+$ \
       && $temporary_database == "spm_verify_$token" && $token =~ ^[a-f0-9]{32}$ ]] || return 1
    local matches
    matches=$(db_sql spmnacional <<< "SELECT count(*) FROM pg_database WHERE datname='$temporary_database' AND oid=$temporary_oid AND shobj_description(oid, 'pg_database')='$marker';")
    [[ $matches == 1 ]] || return 1
    # Exact verified scratch DB only; no force, live DB reset, drop schema or glob.
    db_sql spmnacional <<< "DROP DATABASE \"$temporary_database\";" >> "$log" || return 1
    removed=true
}
finish() {
    local status=$?
    trap - EXIT
    rm -f "$HML_ROOT/state/deployment-ready"
    if [[ $created == true && $removed == false ]]; then
        if ! remove_temporary_database; then
            printf '%s\n' 'Banco temporário não foi removido: identidade não confirmada ou conexões ativas. Não remova outros bancos.' >&2
            status=1
        fi
    fi
    if (( status != 0 )); then
        printf 'Backup não verificado; readiness removida. Confirme gateway/web parados. Arquivos protegidos: %s\n' "$directory" >&2
    fi
    exit "$status"
}
trap finish EXIT
compose stop -t 60 gateway web >> "$log" 2>&1
# Successful stop is insufficient if a competing operator restarted a container.
running=$(compose ps --status running --services gateway web 2>> "$log")
[[ -z $running ]] || { printf '%s\n' 'Aplicação ainda está em execução; backup bloqueado.' >&2; exit 1; }
database_identity=$(db_sql spmnacional <<< "SELECT current_database() || ':' || current_user;")
[[ $database_identity == spmnacional:spm ]] || exit 1
size=$(db_sql spmnacional <<< "SELECT pg_database_size(current_database());")
[[ $size =~ ^[0-9]+$ ]] || exit 1
database_free_kib=$(compose exec -T db sh -c 'df -Pk /var/lib/postgresql | tail -n 1 | awk "{print \$4}"' 2>> "$log")
[[ $database_free_kib =~ ^[0-9]+$ ]] || exit 1
python3 "$HELPER" space "$directory" "$size" "$database_free_kib"
db_sql spmnacional < "$HML_ROOT/backup-integrity.sql" > "$directory/source.before.jsonl"
compose exec -T db sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec timeout 900 pg_dump -h /var/run/postgresql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl --lock-wait-timeout=10s' > "$directory/database.partial" 2>> "$log"
[[ -s "$directory/database.partial" ]] || exit 1
compose exec -T db pg_restore --list < "$directory/database.partial" >> "$log" 2>&1
mv "$directory/database.partial" "$directory/database.dump"
exists=$(db_sql spmnacional <<< "SELECT count(*) FROM pg_database WHERE datname='$temporary_database';")
[[ $exists == 0 ]] || exit 1
db_sql spmnacional <<< "CREATE DATABASE \"$temporary_database\" TEMPLATE template0;" >> "$log"
created=true
db_sql spmnacional <<< "COMMENT ON DATABASE \"$temporary_database\" IS '$marker';" >> "$log"
temporary_oid=$(db_sql spmnacional <<< "SELECT oid FROM pg_database WHERE datname='$temporary_database' AND shobj_description(oid, 'pg_database')='$marker';")
[[ $temporary_oid =~ ^[0-9]+$ ]] || exit 1
python3 "$HELPER" bind "$directory" "$temporary_oid"
compose exec -T db sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec timeout 900 pg_restore -h /var/run/postgresql -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --exit-on-error --single-transaction' sh "$temporary_database" < "$directory/database.dump" >> "$log" 2>&1
db_sql "$temporary_database" < "$HML_ROOT/backup-integrity.sql" > "$directory/restored.jsonl"
db_sql spmnacional < "$HML_ROOT/backup-integrity.sql" > "$directory/source.after.jsonl"
python3 "$HELPER" compare "$directory"
remove_temporary_database
python3 "$HELPER" complete "$directory"
# Never restart the app or recreate readiness. Operator reviews proof before ACKs.
