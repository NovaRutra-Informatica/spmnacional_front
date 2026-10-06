#!/usr/bin/env bash
# One approved 02/10 -> 03/10 06h BRT test guard, never a billing hard cap.
set -Eeuo pipefail
umask 077
source /opt/spm-hml/common.sh
require_root
SYSTEMD_UNIT_DIR=/etc/systemd/system
UNIT=spm-hml-budget-20261002
HELPER="$HML_ROOT/budget-test-window.py"
shape=false
if [[ $# == 2 && $1 == --arm && $2 == --shape ]]; then shape=true
elif [[ $# != 1 || ! $1 =~ ^--(arm|check|cleanup)$ ]]; then
    printf '%s\n' 'Uso: budget-test-window.sh --arm [--shape] | --check | --cleanup' >&2
    exit 1
fi
mode=$1

json_value() { python3 -c 'import json,sys; v=json.load(sys.stdin)[sys.argv[1]]; print(str(v).lower() if isinstance(v,bool) else v)' "$1"; }
close_and_poweroff() {
    printf '%s\n' 'Limite operacional de tráfego HML atingido ou monitor inválido; encerrando os testes.' >&2
    compose stop -t 5 gateway >/dev/null 2>&1 || true
    systemctl poweroff
}
failed_check() {
    trap - ERR
    if authorized_hml_access_exception; then close_and_poweroff; fi
    exit 1
}
if [[ $mode == --check ]]; then trap failed_check ERR; fi
python3 "$HELPER" identity
exec 9>"$HML_ROOT/state/test-budget.lock"
flock -w 5 -x 9

cleanup() {
    local value iface same_boot shaped qdisc
    value=$(python3 "$HELPER" cleanup)
    iface=$(json_value interface <<< "$value")
    same_boot=$(json_value same_boot <<< "$value")
    shaped=$(json_value shaped <<< "$value")
    if [[ $same_boot == true && $shaped == true ]]; then
        qdisc=$(tc -j qdisc show dev "$iface")
        if python3 "$HELPER" owned-qdisc <<< "$qdisc" 2>/dev/null; then
            tc qdisc del dev "$iface" root handle 5a20:
        fi
    fi
    systemctl disable --now "$UNIT.timer" >/dev/null 2>&1
    printf '%s\n' 'Monitor excepcional encerrado; baseline preservada e agenda regular intacta.'
}
if [[ $mode == --cleanup ]]; then cleanup; exit 0; fi
if [[ $mode == --check ]]; then
    value=$(python3 "$HELPER" check)
    state=$(json_value status <<< "$value")
    case "$state" in
        expired|closed) cleanup ;;
        limit) close_and_poweroff ;;
        active)
            if [[ $(json_value shaped <<< "$value") == true ]]; then
                iface=$(json_value interface <<< "$value")
                python3 "$HELPER" owned-qdisc <<< "$(tc -j qdisc show dev "$iface")"
            fi ;;
        *) failed_check ;;
    esac
    exit 0
fi

value=$(python3 "$HELPER" prepare)
iface=$(json_value interface <<< "$value")
existing=$(json_value existing <<< "$value")
if [[ $existing == true && $(json_value shaped <<< "$value") != "$shape" ]]; then
    printf '%s\n' 'Baseline existente não pode ser reiniciada ou alterar shaping.' >&2
    exit 1
fi
created_shape=false
arm_failed() {
    trap - ERR
    if [[ $created_shape == true ]]; then
        if python3 "$HELPER" owned-qdisc <<< "$(tc -j qdisc show dev "$iface")"; then
            tc qdisc del dev "$iface" root handle 5a20: || true
        fi
    fi
    compose stop -t 5 gateway >/dev/null 2>&1 || true
    exit 1
}
trap arm_failed ERR
if [[ $shape == true ]]; then
    qdisc=$(tc -j qdisc show dev "$iface")
    if [[ $existing == true ]]; then python3 "$HELPER" owned-qdisc <<< "$qdisc"
    else
        python3 "$HELPER" default-qdisc <<< "$qdisc"
        tc qdisc add dev "$iface" root handle 5a20: tbf rate 10mbit burst 32kb latency 400ms
        created_shape=true
    fi
fi
if [[ $shape == true ]]; then value=$(python3 "$HELPER" arm --shaped)
else value=$(python3 "$HELPER" arm); fi
cat > "$SYSTEMD_UNIT_DIR/$UNIT.service" <<'EOF'
[Unit]
Description=Check traffic quota for the approved SPM HML October 2026 test window
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/spm-hml/budget-test-window.sh --check
TimeoutStartSec=15
UMask=0077
EOF
cat > "$SYSTEMD_UNIT_DIR/$UNIT.timer" <<'EOF'
[Unit]
Description=Five-second traffic checks only for the approved SPM HML test window
[Timer]
OnActiveSec=1s
OnUnitActiveSec=5s
AccuracySec=1s
RandomizedDelaySec=0
Unit=spm-hml-budget-20261002.service
[Install]
WantedBy=timers.target
EOF
chmod 0644 "$SYSTEMD_UNIT_DIR/$UNIT.service" "$SYSTEMD_UNIT_DIR/$UNIT.timer"
systemctl daemon-reload
systemctl enable --now "$UNIT.timer"
systemctl is-enabled --quiet "$UNIT.timer"
systemctl is-active --quiet "$UNIT.timer"
trap - ERR
python3 -c 'import json,sys; v=json.load(sys.stdin); print(json.dumps({"expiry":v["expires"],"quota_bytes":v["quota_bytes"],"interface":v["interface"],"shaped":v["shaped"],"interval_seconds":5,"timer_armed":True,"baseline_reset":False}))' <<< "$value"
