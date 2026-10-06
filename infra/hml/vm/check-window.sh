#!/usr/bin/env bash
# Deterministic test: the production gate has no configurable bypass.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
date() {
    case "$1" in
        +%u) printf '%s\n' "$mock_weekday" ;;
        +%H) printf '%s\n' "$mock_hour" ;;
        *) return 1 ;;
    esac
}
checks=0
for mock_weekday in 1 2 3 4 5 6 7; do
    for mock_hour in 00 08 09 16 17 23; do
        expected=closed
        case "$mock_weekday:$mock_hour" in
            1:09|1:16|3:09|3:16|5:09|5:16|6:09|6:16|7:09|7:16) expected=open ;;
        esac
        actual=closed
        if in_hml_window; then actual=open; fi
        if [[ $actual != "$expected" ]]; then
            printf 'Falha no gate: dia %s hora %s.\n' "$mock_weekday" "$mock_hour" >&2
            exit 1
        fi
        checks=$((checks + 1))
    done
done
printf 'Gate HML: %s casos passaram, inclusive 09:00 e 17:00 nos sete dias.\n' "$checks"
