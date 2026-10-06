#!/usr/bin/env bash
# Offline fixture: execute the real schedule script against temporary files/mocks.
set -Eeuo pipefail
fixture=$(mktemp -d "${TMPDIR:-/tmp}/spm-hml-cron.XXXXXXXX")
[[ $fixture == "${TMPDIR:-/tmp}/spm-hml-cron."* ]]
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/state" "$fixture/generated"
sed "s|/opt/spm-hml|$fixture|g" "${1:?Pass the real vm/cron.sh path}" >"$fixture/cron.sh"
cat >"$fixture/common.sh" <<EOF
HML_ROOT=$fixture
require_root() { :; }
deployment_ready() { return 0; }
in_hml_window() { [[ \${CLOSED_WINDOW:-0} != 1 ]]; }
EOF
printf 'CRON_SECRET=synthetic-fixture-abcdefghijklmnopqrstuvwxyz\n' >"$fixture/generated/web.env"
cat >"$fixture/bin/date" <<'EOF'
#!/usr/bin/env bash
case ${1:-} in +%Y%m%d) echo 20261002;; +%H) echo 10;; +%M) echo 00;; *) exit 1;; esac
EOF
cat >"$fixture/bin/python3" <<'EOF'
#!/usr/bin/env bash
printf 'Authorization: Bearer synthetic-fixture-only\n' >"$2"
chmod 600 "$2"
EOF
cat >"$fixture/bin/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$fixture/bin/curl" <<'EOF'
#!/usr/bin/env bash
timeout=''
url=''
while (($#)); do
    case $1 in --max-time) shift; timeout=$1;; http://*) url=$1;; esac
    shift
done
printf '%s:%s\n' "${url##*/}" "$timeout" >>"$CRON_TRACE"
[[ $url != */retencao ]]
EOF
chmod +x "$fixture/bin/"*
export PATH="$fixture/bin:$PATH" CRON_TRACE="$fixture/trace"
status=0
bash "$fixture/cron.sh" || status=$?
[[ $status == 1 ]]
[[ $(cat "$CRON_TRACE") == $'retencao:75\nnotificacoes:185' ]]
[[ ! -e "$fixture/state/retencao-20261002" ]]
[[ -e "$fixture/state/notificacoes-20261002-10-00" ]]
[[ $(find "$fixture/state" -name '.cron-header-*' | wc -l) == 0 ]]
: >"$CRON_TRACE"
CLOSED_WINDOW=1 bash "$fixture/cron.sh"
[[ ! -s "$CRON_TRACE" ]]
echo 'PASS: retention failure preserves independent delivery; closed window makes no request; private header cleaned.'
