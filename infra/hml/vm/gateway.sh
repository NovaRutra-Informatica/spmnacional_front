#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
source /opt/spm-hml/common.sh
require_root
exec 8>"$HML_ROOT/state/deploy.lock"
flock -sn 8 || exit 0
exec 9>"$HML_ROOT/state/gateway.lock"
flock -n 9 || exit 0

# No restart policy: a Docker/host reboot cannot reopen the proxy before this check.
if [[ ! -s "$HML_ROOT/compose.env" ]]; then exit 0; fi
if deployment_ready && in_hml_window \
    && curl --fail --silent --max-time 8 http://127.0.0.1:3000/api/health/ready >/dev/null; then
    compose up -d --no-deps gateway >/dev/null
else
    compose stop -t 1 gateway >/dev/null
fi
