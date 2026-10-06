#!/usr/bin/env bash
# One approved exception: 2026-10-02 until 2026-10-03 06:00 America/Sao_Paulo.
# The normal gateway still checks deployment readiness and authentication.
set -Eeuo pipefail
umask 077
source /opt/spm-hml/common.sh
require_root

APPROVED_DATE=2026-10-02
EXPIRY_DATE=2026-10-03
EXPIRES=1791018000
EXCEPTION="$HML_ROOT/state/access-exception.json"
SYSTEMD_UNIT_DIR=/etc/systemd/system
UNIT=spm-hml-test-window-20261002

if [[ $# -gt 1 || ( $# -eq 1 && $1 != --expire ) ]]; then
    printf '%s\n' 'Uso: sudo bash /opt/spm-hml/open-test-window.sh [--expire]' >&2
    exit 1
fi

now=$(date +%s)
today=$(TZ=America/Sao_Paulo date +%F)

remove_exception() {
    python3 - "$EXCEPTION" <<'PY'
from pathlib import Path
import stat
import sys

path = Path(sys.argv[1])
try:
    info = path.lstat()
except FileNotFoundError:
    sys.exit(0)
if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
    print('Arquivo de exceção HML sem permissões esperadas.', file=sys.stderr)
    sys.exit(1)
path.unlink()
PY
}

if [[ ${1:-} == --expire ]]; then
    # Persistent timers can catch up late. Only a five-minute deadline grace
    # may shut down this host; a later boot must preserve the regular schedule.
    if (( now < EXPIRES )); then exit 0; fi
    # A corrupt override cannot prevent today's approved host shutdown.
    if ! remove_exception; then
        printf '%s\n' 'A exceção não pôde ser removida; sua validade temporal continua limitada.' >&2
    fi
    if [[ $today != "$EXPIRY_DATE" ]] || (( now >= EXPIRES + 300 )); then
        printf '%s\n' 'Exceção HML expirada; nenhuma parada fora da data aprovada.'
        exit 0
    fi
    printf '%s\n' 'Janela excepcional HML encerrada; desligamento do host solicitado.'
    systemctl poweroff
    exit 0
fi

# Only installation depends on local metadata. Expiration must still power off
# today if the override, metadata or state directory were removed or corrupted.
python3 - "$HML_ROOT" <<'PY'
import json
from pathlib import Path
import stat
import sys

root = Path(sys.argv[1])
try:
    for directory in (root, root / 'state'):
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError()
    metadata = root / 'metadata.json'
    info = metadata.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError()
    value = json.loads(metadata.read_text())
    if value.get('hml-project-id') != 'site-institucional-510319' or value.get('hml-region') != 'southamerica-east1':
        raise ValueError()
except Exception:
    print('Exceção HML recusada: projeto ou arquivos locais não conferem.', file=sys.stderr)
    sys.exit(1)
PY

# This independent lock permits preparation while the boot deploy is running.
exec 9>"$HML_ROOT/state/access-exception.lock"
flock -w 10 -x 9

if [[ $today != "$APPROVED_DATE" ]] || (( now >= EXPIRES || EXPIRES - now > 86400 )); then
    printf '%s\n' 'A exceção HML foi autorizada em 02/10/2026 somente até 06h de 03/10, horário de Brasília; máximo 24h.' >&2
    exit 1
fi

# Arm the shutdown before exposing any exception to the gateway.
cat > "$SYSTEMD_UNIT_DIR/$UNIT.service" <<'EOF'
[Unit]
Description=End the approved SPM HML test window on 2026-10-03 at 06h Brasilia
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/spm-hml/open-test-window.sh --expire
TimeoutStartSec=40
Restart=on-failure
RestartSec=5
UMask=0077
EOF
cat > "$SYSTEMD_UNIT_DIR/$UNIT.timer" <<'EOF'
[Unit]
Description=One SPM HML shutdown at 06h Brasilia on 2026-10-03

[Timer]
OnCalendar=2026-10-03 09:00:00 UTC
AccuracySec=1s
RandomizedDelaySec=0
Persistent=true
Unit=spm-hml-test-window-20261002.service

[Install]
WantedBy=timers.target
EOF
chmod 0644 "$SYSTEMD_UNIT_DIR/$UNIT.service" "$SYSTEMD_UNIT_DIR/$UNIT.timer"
systemctl daemon-reload
systemctl enable --now "$UNIT.timer"
systemctl is-enabled --quiet "$UNIT.timer"
systemctl is-active --quiet "$UNIT.timer"

completed=$(date +%s)
python3 - "$EXCEPTION" "$now" "$completed" <<'PY'
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo

path = Path(sys.argv[1])
start = int(sys.argv[2])
completed = int(sys.argv[3])
expires = 1791018000
try:
    if datetime.fromtimestamp(start, ZoneInfo('America/Sao_Paulo')).date().isoformat() != '2026-10-02':
        raise ValueError()
    # Installation must finish before the scheduled stop, even if setup was slow.
    if not start <= completed < expires or expires - start > 86400:
        raise ValueError()
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError()
    value = {'approved_date': '2026-10-02', 'timezone': 'America/Sao_Paulo', 'start': start, 'expires': expires}
    descriptor, temporary = tempfile.mkstemp(prefix='.access-exception-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as handle:
            json.dump(value, handle, separators=(',', ':'))
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
except Exception:
    print('Não foi possível instalar a exceção HML protegida.', file=sys.stderr)
    sys.exit(1)
PY
printf '%s\n' 'Exceção HML instalada até 06h de Brasília de 03/10/2026; gate mantém readiness e autenticação. Nenhum recurso GCP foi criado.'
