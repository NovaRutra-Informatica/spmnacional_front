#!/usr/bin/env bash
# Shared helpers; configuration files are never executed as shell code.
set -Eeuo pipefail
umask 077
HML_ROOT=/opt/spm-hml

require_root() {
    if [[ ${EUID} -ne 0 ]]; then
        printf '%s\n' 'Execute com sudo/root na VM HML.' >&2
        exit 1
    fi
}

compose() {
    docker compose --project-name spm-hml \
        --project-directory "$HML_ROOT" \
        --env-file "$HML_ROOT/compose.env" \
        -f "$HML_ROOT/docker-compose.yml" "$@"
}

authorized_hml_access_exception() {
    [[ -f "$HML_ROOT/state/access-exception.json" ]] || return 1
    # Only the explicitly approved 2026-10-02 overnight exception extends access.
    # No caller-supplied clock, environment flag or permanent schedule override.
    python3 - "$HML_ROOT/state/access-exception.json" <<'PY_ACCESS_EXCEPTION'
import datetime
import json
import os
import stat
import sys
import time
from zoneinfo import ZoneInfo

APPROVED_DATE = "2026-10-02"
APPROVED_TIMEZONE = "America/Sao_Paulo"
HARD_DEADLINE = 1791018000  # 2026-10-03 06:00:00 America/Sao_Paulo


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate field")
        result[key] = value
    return result


def exception_is_current(value, now):
    if not isinstance(value, dict) or set(value) != {
        "approved_date", "timezone", "start", "expires"
    }:
        return False
    if value["approved_date"] != APPROVED_DATE or value["timezone"] != APPROVED_TIMEZONE:
        return False
    start, expires = value["start"], value["expires"]
    if type(start) is not int or type(expires) is not int:
        return False
    if not (0 < start < expires <= HARD_DEADLINE and expires - start <= 86400):
        return False
    if not (start <= now < expires):
        return False
    zone = ZoneInfo(APPROVED_TIMEZONE)
    if datetime.datetime.fromtimestamp(start, zone).date().isoformat() != APPROVED_DATE:
        return False
    return datetime.datetime.fromtimestamp(now, zone).date().isoformat() in {APPROVED_DATE, "2026-10-03"}


def protected_exception_is_current(filename, now):
    # Open without following links; validate the opened inode rather than a prior
    # pathname stat. Nonblocking open also prevents a malformed FIFO from hanging.
    descriptor = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "r", encoding="utf-8") as stream:
        info = os.fstat(stream.fileno())
        if not (stat.S_ISREG(info.st_mode) and info.st_uid == 0
                and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
                and 0 < info.st_size <= 4096):
            return False
        value = json.loads(stream.read(4097), object_pairs_hook=unique_object)
        return exception_is_current(value, now)


if __name__ == "__main__":
    try:
        allowed = protected_exception_is_current(sys.argv[1], time.time())
    except Exception:
        allowed = False
    sys.exit(0 if allowed else 1)
PY_ACCESS_EXCEPTION
}

in_hml_window() {
    local weekday hour
    weekday=$(TZ=America/Sao_Paulo date +%u)
    hour=$(TZ=America/Sao_Paulo date +%H)
    case "$weekday" in
        1|3|5|6|7)
            if (( 10#$hour >= 9 && 10#$hour < 17 )); then return 0; fi ;;
    esac
    authorized_hml_access_exception
}

metadata_value() {
    curl --fail --silent --show-error --max-time 10 \
        -H 'Metadata-Flavor: Google' \
        "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"
}

configuration_exists() {
    [[ -s "$HML_ROOT/release.env" && -s "$HML_ROOT/config.env" && \
       -s "$HML_ROOT/docker-compose.yml" && -s "$HML_ROOT/configure.py" ]]
}

ready_signature() {
    cat /proc/sys/kernel/random/boot_id
    sha256sum "$HML_ROOT/config.env" "$HML_ROOT/release.env" "$HML_ROOT/generated/web.env"
}

deployment_ready() {
    configuration_exists && [[ -s "$HML_ROOT/generated/web.env" && \
        -s "$HML_ROOT/state/deployment-ready" ]] || return 1
    [[ $(cat "$HML_ROOT/state/deployment-ready") == "$(ready_signature)" ]]
}
