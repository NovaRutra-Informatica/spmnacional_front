#!/usr/bin/env python3
"""Run the actual shell helper in isolated fixtures, with no real systemctl calls."""
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from datetime import datetime, timezone


def epoch(value):
    return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp())


SOURCE = Path(__file__).with_name('open-test-window.sh').read_text()
EXPIRES = epoch('2026-10-03T09:00:00Z')
assert EXPIRES == 1791018000
assert SOURCE.count('source /opt/spm-hml/common.sh') == 1
assert SOURCE.count('SYSTEMD_UNIT_DIR=/etc/systemd/system') == 1
assert 'systemctl poweroff' in SOURCE
assert '/usr/bin/systemctl' not in SOURCE and '/sbin/shutdown' not in SOURCE


def fixture(now, argument=None, fail_enable=False, bad_metadata=False, exception_mode=0o600,
            completed=None, approved_date='2026-10-02'):
    with tempfile.TemporaryDirectory(prefix='spm-hml-window-fixture-') as temporary:
        root = Path(temporary)
        os.chmod(root, 0o700)
        state = root / 'state'
        state.mkdir(mode=0o700)
        units = root / 'units'
        units.mkdir(mode=0o700)
        metadata = root / 'metadata.json'
        metadata.write_text(json.dumps({'hml-project-id': 'other' if bad_metadata else 'site-institucional-510319',
                                       'hml-region': 'southamerica-east1'}))
        metadata.chmod(0o600)
        path = state / 'access-exception.json'
        if argument == '--expire':
            path.write_text(json.dumps({'approved_date': approved_date, 'timezone': 'America/Sao_Paulo',
                                        'start': EXPIRES - 3600, 'expires': EXPIRES}))
            path.chmod(exception_mode)
        local = datetime.fromtimestamp(now, timezone.utc).astimezone(
            __import__('zoneinfo').ZoneInfo('America/Sao_Paulo')).date().isoformat()
        common = root / 'common.sh'
        # Dates are deterministic. All systemctl verbs are captured by this function.
        common.write_text(f'''HML_ROOT='{root}'
require_root() {{ [[ $EUID -eq 0 ]]; }}
date_calls=0
date() {{
    case "$1" in
      +%s) if [[ -e '{root}/second-clock' ]]; then printf '%s\\n' {completed if completed is not None else now}; else touch '{root}/second-clock'; printf '%s\\n' {now}; fi ;;
      +%F) printf '%s\\n' {local} ;;
      *) return 1 ;;
    esac
}}
systemctl() {{
    printf '%s\\n' "$*" >> '{root}/commands'
    if [[ $1 == enable && {int(fail_enable)} == 1 ]]; then return 1; fi
    if [[ $1 == enable && -e '{path}' ]]; then printf '%s\\n' 'OVERRIDE_EXISTED_BEFORE_TIMER' >> '{root}/commands'; fi
    return 0
}}
''')
        helper = root / 'helper.sh'
        helper.write_text(SOURCE.replace('source /opt/spm-hml/common.sh', f"source '{common}'")
                          .replace('SYSTEMD_UNIT_DIR=/etc/systemd/system', f"SYSTEMD_UNIT_DIR='{units}'"))
        # A minimal environment and mocked shell function ensure no shutdown invocation.
        result = subprocess.run(['bash', str(helper)] + ([] if argument is None else [argument]),
                                env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'},
                                capture_output=True, text=True, timeout=25)
        commands = (root / 'commands').read_text().splitlines() if (root / 'commands').exists() else []
        value = json.loads(path.read_text()) if path.exists() else None
        mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else None
        timer = (units / 'spm-hml-test-window-20261002.timer').read_text() if (
            units / 'spm-hml-test-window-20261002.timer').exists() else ''
        service = (units / 'spm-hml-test-window-20261002.service').read_text() if (
            units / 'spm-hml-test-window-20261002.service').exists() else ''
        return result.returncode, commands, value, mode, timer, service


def main():
    if os.geteuid() != 0:
        raise SystemExit('Execute somente o teste em um ambiente Linux isolado como root.')
    checks = 0
    before = epoch('2026-10-02T23:30:00Z')
    code, commands, value, mode, timer, service = fixture(before)
    assert code == 0 and value == {'approved_date': '2026-10-02', 'timezone': 'America/Sao_Paulo',
                                   'start': before, 'expires': EXPIRES}
    assert mode == 0o600
    assert commands == ['daemon-reload', 'enable --now spm-hml-test-window-20261002.timer',
                        'is-enabled --quiet spm-hml-test-window-20261002.timer',
                        'is-active --quiet spm-hml-test-window-20261002.timer']
    assert 'OnCalendar=2026-10-03 09:00:00 UTC' in timer and 'Persistent=true' in timer
    assert 'AccuracySec=1s' in timer and 'RandomizedDelaySec=0' in timer
    assert 'open-test-window.sh --expire' in service and 'Restart=on-failure' in service
    checks += 6

    for instant in [EXPIRES, EXPIRES + 1, EXPIRES + 299]:
        code, commands, value, *_ = fixture(instant, '--expire')
        assert code == 0 and commands == ['poweroff'] and value is None
        checks += 1
    for instant in [EXPIRES + 300, epoch('2026-10-03T12:00:00Z'),
                    epoch('2026-10-04T09:00:00Z')]:
        code, commands, value, *_ = fixture(instant, '--expire')
        assert code == 0 and commands == [] and value is None
        checks += 1
    code, commands, value, *_ = fixture(EXPIRES - 1, '--expire')
    assert code == 0 and commands == [] and value is not None
    checks += 1
    for instant in [EXPIRES, EXPIRES + 1, epoch('2026-10-03T08:00:00Z'), epoch('2026-10-01T23:30:00Z'), epoch('2026-10-02T08:59:59Z')]:
        code, commands, value, *_ = fixture(instant)
        assert code != 0 and commands == [] and value is None
        checks += 1
    code, commands, value, *_ = fixture(before, fail_enable=True)
    assert code != 0 and value is None and 'poweroff' not in commands
    checks += 1
    code, commands, value, *_ = fixture(before, bad_metadata=True)
    assert code != 0 and commands == [] and value is None
    checks += 1
    code, commands, value, *_ = fixture(before, completed=EXPIRES)
    assert code != 0 and value is None and 'poweroff' not in commands
    checks += 1
    code, commands, value, *_ = fixture(EXPIRES, '--expire', exception_mode=0o644)
    assert code == 0 and commands == ['poweroff']  # Corruption cannot prevent today's stop.
    checks += 1
    code, commands, value, *_ = fixture(EXPIRES, '--expire', bad_metadata=True)
    assert code == 0 and commands == ['poweroff'] and value is None
    checks += 1
    code, commands, value, *_ = fixture(epoch('2026-10-03T12:00:00Z'), '--expire', exception_mode=0o644)
    assert code == 0 and commands == []
    checks += 1
    code, commands, value, *_ = fixture(before, '--wrong')
    assert code != 0 and commands == [] and value is None
    checks += 1
    print(f'HML test-window helper: {checks} checks passed; every systemctl call was mocked.')


if __name__ == '__main__':
    main()
