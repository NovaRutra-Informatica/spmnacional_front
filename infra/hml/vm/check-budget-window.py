#!/usr/bin/env python3
"""Actual Bash guard in isolated root fixtures; every tc/systemctl/compose is fake."""
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile

DIRECTORY = Path(__file__).parent
SHELL = (DIRECTORY / 'budget-test-window.sh').read_text()
HELPER = (DIRECTORY / 'budget-test-window.py').read_text()
DEADLINE = 1791018000
QUOTA = 512 * 1024 * 1024
BOOT = '11111111-1111-1111-1111-111111111111'
DEFAULT = [{'kind': 'fq_codel', 'handle': '0:', 'root': True}]
OWNED = [{'kind': 'tbf', 'handle': '5a20:', 'root': True, 'options': {'rate': 1250000}}]
assert SHELL.count('source /opt/spm-hml/common.sh') == 1
assert SHELL.count('SYSTEMD_UNIT_DIR=/etc/systemd/system') == 1
assert '/usr/bin/tc' not in SHELL and '/usr/bin/systemctl' not in SHELL


class Fixture:
    def __init__(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='spm-budget-fixture-')
        self.root = Path(self.temporary.name)
        self.root.chmod(0o700)
        for directory in ['state', 'units', 'bin', 'network/ens4/statistics']:
            (self.root / directory).mkdir(mode=0o700, parents=True, exist_ok=True)
        self.metadata = self.root / 'metadata.json'
        self.metadata.write_text(json.dumps({'hml-project-id': 'site-institucional-510319', 'hml-region': 'southamerica-east1'}))
        self.metadata.chmod(0o600)
        self.now = self.root / 'fixture-now'
        self.now.write_text(str(DEADLINE - 6 * 3600))
        self.boot = self.root / 'boot-id'
        self.boot.write_text(BOOT)
        self.counter = self.root / 'network/ens4/statistics/tx_bytes'
        self.counter.write_text('1000')
        self.route = self.root / 'route.json'
        self.route.write_text(json.dumps([{'dst': 'default', 'dev': 'ens4'}]))
        self.qdisc = self.root / 'qdisc.json'
        self.qdisc.write_text(json.dumps(DEFAULT))
        self.exception = self.root / 'state/access-exception.json'
        self.exception.write_text(json.dumps({'approved_date': '2026-10-02', 'timezone': 'America/Sao_Paulo',
                                             'start': DEADLINE - 8 * 3600, 'expires': DEADLINE}))
        self.exception.chmod(0o600)
        self.baseline = self.root / 'state/test-budget.json'
        ip = self.root / 'bin/ip'
        ip.write_text(f"#!/bin/sh\ncat '{self.route}'\n")
        ip.chmod(0o700)
        helper = HELPER.replace("ROOT = Path('/opt/spm-hml')", f'ROOT = Path({str(self.root)!r})')
        helper = helper.replace("BOOT_ID = Path('/proc/sys/kernel/random/boot_id')", f'BOOT_ID = Path({str(self.boot)!r})')
        helper = helper.replace("NETWORK = Path('/sys/class/net')", f'NETWORK = Path({str(self.root / "network")!r})')
        helper = helper.replace('now = int(time.time())', "now = int((ROOT / 'fixture-now').read_text())")
        (self.root / 'budget-test-window.py').write_text(helper)
        common = self.root / 'common.sh'
        common.write_text(f'''HML_ROOT='{self.root}'
require_root() {{ [[ $EUID -eq 0 ]]; }}
authorized_hml_access_exception() {{
    python3 -c "import json; from pathlib import Path; p=Path('{self.exception}'); n=int(Path('{self.now}').read_text()); v=json.loads(p.read_text()) if p.exists() else {{}}; exit(0 if v.get('approved_date')=='2026-10-02' and v.get('start',0)<=n<v.get('expires',0) else 1)"
}}
compose() {{ printf 'compose %s\\n' "$*" >> '{self.root}/commands'; }}
systemctl() {{
    printf 'systemctl %s\\n' "$*" >> '{self.root}/commands'
    if [[ $1 == enable && -e '{self.root}/fail-enable' ]]; then return 1; fi
}}
tc() {{
    printf 'tc %s\\n' "$*" >> '{self.root}/commands'
    if [[ $1 == -j ]]; then cat '{self.qdisc}'; return 0; fi
    if [[ $1 == qdisc && $2 == add ]]; then
        [[ ! -e '{self.root}/fail-add' ]] || return 1
        printf '%s\\n' '{json.dumps(OWNED)}' > '{self.qdisc}'; return 0
    fi
    if [[ $1 == qdisc && $2 == del ]]; then printf '%s\\n' '{json.dumps(DEFAULT)}' > '{self.qdisc}'; return 0; fi
    return 1
}}
''')
        self.script = self.root / 'guard.sh'
        self.script.write_text(SHELL.replace('source /opt/spm-hml/common.sh', f"source '{common}'")
                               .replace('SYSTEMD_UNIT_DIR=/etc/systemd/system', f"SYSTEMD_UNIT_DIR='{self.root / 'units'}'"))

    def close(self):
        self.temporary.cleanup()

    def run(self, *args):
        return subprocess.run(['bash', str(self.script), *args], capture_output=True, text=True, timeout=20,
                              env={'PATH': str(self.root / 'bin') + ':/usr/bin:/bin', 'LANG': 'C.UTF-8'})

    def commands(self):
        path = self.root / 'commands'
        return path.read_text().splitlines() if path.exists() else []

    def clear_commands(self):
        (self.root / 'commands').write_text('')

    def change_baseline(self, **changes):
        value = json.loads(self.baseline.read_text())
        value.update(changes)
        self.baseline.write_text(json.dumps(value))


def main():
    assert os.geteuid() == 0, 'Run only this test in an isolated Linux root fixture.'
    checks = 0
    fixture = Fixture()
    try:
        result = fixture.run('--arm')
        assert result.returncode == 0, result.stderr
        assert json.loads(result.stdout) == {'expiry': DEADLINE, 'quota_bytes': QUOTA, 'interface': 'ens4', 'shaped': False,
                                          'interval_seconds': 5, 'timer_armed': True, 'baseline_reset': False}
        assert stat.S_IMODE(fixture.baseline.stat().st_mode) == 0o600 and fixture.baseline.stat().st_nlink == 1
        initial = fixture.baseline.read_text()
        fixture.counter.write_text('2000')
        assert fixture.run('--arm').returncode == 0 and fixture.baseline.read_text() == initial
        timer = (fixture.root / 'units/spm-hml-budget-20261002.timer').read_text()
        assert 'OnUnitActiveSec=5s' in timer and 'AccuracySec=1s' in timer
        assert 'RandomizedDelaySec=0' in timer and 'OnActiveSec=1s' in timer
        checks += 5
        fixture.clear_commands()
        fixture.counter.write_text(str(1000 + QUOTA - 1))
        assert fixture.run('--check').returncode == 0 and not fixture.commands()
        fixture.counter.write_text(str(1000 + QUOTA))
        assert fixture.run('--check').returncode == 0
        assert fixture.commands() == ['compose stop -t 5 gateway', 'systemctl poweroff']
        assert fixture.baseline.read_text() == initial
        checks += 3
    finally: fixture.close()

    fixture = Fixture()
    try:
        assert fixture.run('--arm', '--shape').returncode == 0
        assert json.loads(fixture.baseline.read_text())['shaped'] is True
        initial = fixture.baseline.read_text()
        assert fixture.run('--arm', '--shape').returncode == 0
        assert sum('qdisc add' in command for command in fixture.commands()) == 1
        assert fixture.baseline.read_text() == initial
        assert any('rate 10mbit burst 32kb' in command for command in fixture.commands())
        fixture.clear_commands()
        fixture.now.write_text(str(DEADLINE))
        assert fixture.run('--check').returncode == 0
        assert 'tc qdisc del dev ens4 root handle 5a20:' in fixture.commands()
        assert not any('poweroff' in command or 'compose ' in command for command in fixture.commands())
        assert fixture.baseline.read_text() == initial
        assert 'systemctl disable --now spm-hml-budget-20261002.timer' in fixture.commands()
        fixture.clear_commands()
        fixture.now.write_text(str(DEADLINE + 10800))  # Regular Saturday09h BRT.
        assert fixture.run('--check').returncode == 0
        assert not any('qdisc del' in command or 'poweroff' in command or 'compose ' in command for command in fixture.commands())
        assert fixture.run('--arm', '--shape').returncode != 0
        checks += 10
    finally: fixture.close()

    for custom in [
        [{'kind': 'htb', 'handle': '1:', 'root': True}],
        [{'kind': 'fq_codel', 'handle': '8001:', 'root': True}],
        [{'kind': 'mq', 'handle': '0:', 'root': True}, {'kind': 'fq_codel', 'parent': '1:1'}],
    ]:
        fixture = Fixture()
        try:
            fixture.qdisc.write_text(json.dumps(custom))
            assert fixture.run('--arm', '--shape').returncode != 0
            assert not fixture.baseline.exists() and json.loads(fixture.qdisc.read_text()) == custom
            assert not any('qdisc add' in command or 'qdisc del' in command for command in fixture.commands())
            checks += 3
        finally: fixture.close()

    fixture = Fixture()
    try:
        fixture.qdisc.write_text(json.dumps([{'kind': 'mq', 'handle': '0:', 'root': True},
                                             {'kind': 'fq_codel', 'handle': '0:', 'parent': ':1'},
                                             {'kind': 'pfifo_fast', 'handle': '0:', 'parent': ':2'}]))
        assert fixture.run('--arm', '--shape').returncode == 0
        assert any('qdisc add' in command for command in fixture.commands())
        checks += 2
    finally: fixture.close()

    for change in ['boot', 'counter', 'interface', 'ambiguous', 'quota', 'baseline-mode', 'baseline-owner', 'baseline-link', 'baseline-hardlink', 'baseline-fifo', 'baseline-duplicate', 'clock', 'qdisc', 'exception-change']:
        fixture = Fixture()
        try:
            assert fixture.run('--arm', '--shape').returncode == 0
            fixture.clear_commands()
            if change == 'boot': fixture.boot.write_text('22222222-2222-2222-2222-222222222222')
            elif change == 'counter': fixture.counter.write_text('999')
            elif change == 'interface': fixture.route.write_text(json.dumps([{'dev': 'ens5'}]))
            elif change == 'ambiguous': fixture.route.write_text(json.dumps([{'dev': 'ens4'}, {'dev': 'ens5'}]))
            elif change == 'quota': fixture.change_baseline(quota_bytes=QUOTA + 1)
            elif change == 'baseline-mode': fixture.baseline.chmod(0o644)
            elif change == 'baseline-owner': os.chown(fixture.baseline, 1000, 1000)
            elif change == 'baseline-link':
                data = fixture.root / 'baseline-target'
                fixture.baseline.rename(data)
                fixture.baseline.symlink_to(data)
            elif change == 'baseline-hardlink': os.link(fixture.baseline, fixture.root / 'baseline-link')
            elif change == 'baseline-fifo': fixture.baseline.unlink(); os.mkfifo(fixture.baseline, 0o600)
            elif change == 'baseline-duplicate': fixture.baseline.write_text('{"quota_bytes":536870912,"quota_bytes":536870912}')
            elif change == 'clock': fixture.now.write_text(str(DEADLINE - 6 * 3600 - 1))
            elif change == 'qdisc': fixture.qdisc.write_text(json.dumps([{'kind': 'htb', 'handle': '1:', 'root': True}]))
            elif change == 'exception-change':
                value = json.loads(fixture.exception.read_text()); value['expires'] -= 1; fixture.exception.write_text(json.dumps(value))
            assert fixture.run('--check').returncode != 0
            assert fixture.commands()[-2:] == ['compose stop -t 5 gateway', 'systemctl poweroff'], (change, fixture.commands())
            assert not any('qdisc del' in command for command in fixture.commands())
            checks += 3
        finally: fixture.close()

    for day in [DEADLINE + 10800, DEADLINE + 86400]:
        fixture = Fixture()
        try:
            assert fixture.run('--arm', '--shape').returncode == 0
            fixture.now.write_text(str(day))
            fixture.boot.write_text('22222222-2222-2222-2222-222222222222')
            fixture.clear_commands()
            assert fixture.run('--check').returncode == 0
            assert fixture.commands() == ['systemctl disable --now spm-hml-budget-20261002.timer']
            checks += 2
        finally: fixture.close()

    for failure in ['fail-enable', 'fail-add']:
        fixture = Fixture()
        try:
            (fixture.root / failure).touch()
            assert fixture.run('--arm', '--shape').returncode != 0
            assert 'compose stop -t 5 gateway' in fixture.commands()
            assert json.loads(fixture.qdisc.read_text()) == DEFAULT
            checks += 3
        finally: fixture.close()

    fixture = Fixture()
    try:
        assert fixture.run('--arm', '--shape').returncode == 0
        fixture.exception.unlink()
        fixture.clear_commands()
        assert fixture.run('--check').returncode == 0
        assert 'tc qdisc del dev ens4 root handle 5a20:' in fixture.commands()
        assert not any('poweroff' in command for command in fixture.commands())
        checks += 3
    finally: fixture.close()
    print(f'HML budget guard: {checks} checks passed; all tc/systemctl/compose operations were mocked.')


if __name__ == '__main__': main()
