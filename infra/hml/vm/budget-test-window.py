#!/usr/bin/env python3
"""Fixed-window network guard metadata. No cloud, credentials or billing API."""
import datetime
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time
from zoneinfo import ZoneInfo

ROOT = Path('/opt/spm-hml')
BOOT_ID = Path('/proc/sys/kernel/random/boot_id')
NETWORK = Path('/sys/class/net')
DEADLINE = 1791018000
QUOTA = 512 * 1024 * 1024
HANDLE = '5a20:'
ZONE = ZoneInfo('America/Sao_Paulo')


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON field')
        result[key] = value
    return result


def protected_json(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, encoding='utf-8') as stream:
        info = os.fstat(stream.fileno())
        if not (stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600
                and info.st_nlink == 1 and 0 < info.st_size <= 4096):
            raise ValueError('unsafe metadata file')
        return json.loads(stream.read(4097), object_pairs_hook=unique)


def identity():
    for path in (ROOT, ROOT / 'state'):
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError('unsafe HML root')
    metadata = protected_json(ROOT / 'metadata.json')
    if metadata.get('hml-project-id') != 'site-institucional-510319' or metadata.get('hml-region') != 'southamerica-east1':
        raise ValueError('wrong HML identity')


def approval(now):
    value = protected_json(ROOT / 'state/access-exception.json')
    if set(value) != {'approved_date', 'timezone', 'start', 'expires'} or value['approved_date'] != '2026-10-02' or value['timezone'] != 'America/Sao_Paulo':
        raise ValueError('wrong exception')
    start, expires = value['start'], value['expires']
    if type(start) is not int or type(expires) is not int or not (0 < start <= now < expires <= DEADLINE and expires - start <= 86400):
        raise ValueError('inactive exception')
    if datetime.datetime.fromtimestamp(start, ZONE).date().isoformat() != '2026-10-02':
        raise ValueError('wrong approval date')
    return value


def network_snapshot():
    route = subprocess.run(['ip', '-j', 'route', 'show', 'default'], check=True, capture_output=True, text=True, timeout=2)
    entries = json.loads(route.stdout)
    devices = {item.get('dev') for item in entries if item.get('type', 'unicast') == 'unicast'}
    if len(devices) != 1:
        raise ValueError('ambiguous default interface')
    interface = devices.pop()
    if not isinstance(interface, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,15}', interface) or interface == 'lo':
        raise ValueError('invalid default interface')
    boot = BOOT_ID.read_text().strip()
    counter = (NETWORK / interface / 'statistics/tx_bytes').read_text().strip()
    if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', boot) or not re.fullmatch(r'[0-9]{1,20}', counter):
        raise ValueError('invalid network counter')
    counter = int(counter)
    if counter > 2 ** 64 - 1:
        raise ValueError('network counter overflow')
    return {'interface': interface, 'boot_id': boot, 'tx_bytes': counter}


def baseline():
    value = protected_json(ROOT / 'state/test-budget.json')
    fields = {'schema_version', 'approved_date', 'timezone', 'started', 'expires', 'boot_id', 'interface', 'baseline_tx_bytes', 'quota_bytes', 'shaped', 'shape_handle'}
    if set(value) != fields or type(value['schema_version']) is not int or value['schema_version'] != 1:
        raise ValueError('invalid baseline schema')
    if value['approved_date'] != '2026-10-02' or value['timezone'] != 'America/Sao_Paulo':
        raise ValueError('invalid baseline approval')
    start, expires = value['started'], value['expires']
    if type(start) is not int or type(expires) is not int or not (0 < start < expires <= DEADLINE and expires - start <= 86400):
        raise ValueError('invalid baseline deadline')
    if datetime.datetime.fromtimestamp(start, ZONE).date().isoformat() not in {'2026-10-02', '2026-10-03'}:
        raise ValueError('invalid baseline date')
    if type(value['quota_bytes']) is not int or value['quota_bytes'] != QUOTA or type(value['shaped']) is not bool:
        raise ValueError('invalid baseline quota')
    if value['shape_handle'] != (HANDLE if value['shaped'] else None) or not isinstance(value['boot_id'], str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value['boot_id']):
        raise ValueError('invalid baseline shaping')
    if not isinstance(value['interface'], str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,15}', value['interface']) or value['interface'] == 'lo':
        raise ValueError('invalid baseline interface')
    counter = value['baseline_tx_bytes']
    if type(counter) is not int or not 0 <= counter <= 2 ** 64 - 1:
        raise ValueError('invalid baseline counter')
    return value


def status(now):
    value = baseline()
    if now >= value['expires']:
        return {**value, 'status': 'expired'}
    if now < value['started']:
        raise ValueError('clock regressed before baseline')
    try:
        approved = approval(now)
    except FileNotFoundError:
        return {**value, 'status': 'closed'}
    if approved['expires'] != value['expires']:
        raise ValueError('exception changed after baseline')
    current = network_snapshot()
    if current['boot_id'] != value['boot_id'] or current['interface'] != value['interface'] or current['tx_bytes'] < value['baseline_tx_bytes']:
        raise ValueError('boot, interface or counter changed')
    used = current['tx_bytes'] - value['baseline_tx_bytes']
    return {**value, 'used_bytes': used, 'status': 'limit' if used >= QUOTA else 'active'}


def qdisc(mode):
    value = json.loads(sys.stdin.read(16385))
    if not isinstance(value, list) or not value:
        raise ValueError('custom qdisc')
    roots = [entry for entry in value if entry.get('root')]
    if len(roots) != 1:
        raise ValueError('not a root qdisc')
    root = roots[0]
    if mode == 'default-qdisc':
        if root.get('kind') == 'mq' and root.get('handle') == '0:' and len(value) > 1:
            children = [entry for entry in value if not entry.get('root')]
            if all(entry.get('kind') in {'fq_codel', 'pfifo_fast', 'noqueue'} and entry.get('handle') == '0:'
                   and re.fullmatch(r':[1-9a-f][0-9a-f]*', entry.get('parent', '')) for entry in children):
                return
        if len(value) != 1 or root.get('kind') not in {'noqueue', 'fq_codel'} or root.get('handle') != '0:':
            raise ValueError('custom qdisc')
    elif len(value) != 1 or root.get('kind') != 'tbf' or root.get('handle') != HANDLE or root.get('options', {}).get('rate') != 1250000:
        raise ValueError('qdisc is not owned by this guard')


def main(args):
    if len(args) not in {1, 2}:
        raise ValueError('invalid guard arguments')
    mode = args[0]
    if mode in {'default-qdisc', 'owned-qdisc'} and len(args) == 1:
        qdisc(mode)
        return
    if mode not in {'identity', 'prepare', 'arm', 'check', 'cleanup'} or (len(args) == 2 and args != ['arm', '--shaped']):
        raise ValueError('invalid guard mode')
    identity()
    now = int(time.time())
    path = ROOT / 'state/test-budget.json'
    if mode == 'identity':
        return
    if mode == 'cleanup':
        value = baseline()
        if now < value['expires'] and (ROOT / 'state/access-exception.json').exists():
            raise ValueError('budget still active')
        # Keep the immutable baseline for audit and to prevent a quota reset.
        print(json.dumps({**value, 'same_boot': BOOT_ID.read_text().strip() == value['boot_id']}))
        return
    if mode == 'check':
        print(json.dumps(status(now)))
        return
    approved = approval(now)
    if path.exists() or path.is_symlink():
        value = status(now)
        if value['status'] != 'active' or (mode == 'arm' and value['shaped'] != (len(args) == 2)):
            raise ValueError('existing baseline cannot be reset')
        print(json.dumps({**value, 'existing': True}))
        return
    current = network_snapshot()
    value = {'schema_version': 1, 'approved_date': '2026-10-02', 'timezone': 'America/Sao_Paulo', 'started': now,
             'expires': approved['expires'], 'boot_id': current['boot_id'], 'interface': current['interface'],
             'baseline_tx_bytes': current['tx_bytes'], 'quota_bytes': QUOTA, 'shaped': len(args) == 2,
             'shape_handle': HANDLE if len(args) == 2 else None}
    if mode == 'arm':
        descriptor, temporary = tempfile.mkstemp(prefix='.test-budget-', dir=path.parent)
        try:
            with os.fdopen(descriptor, 'w') as stream:
                json.dump(value, stream, separators=(',', ':'))
                stream.write('\n')
                stream.flush()
                os.fsync(stream.fileno())
            # Atomic exclusive publication: never replace or reset an existing baseline.
            os.link(temporary, path, follow_symlinks=False)
        finally:
            os.unlink(temporary)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    print(json.dumps({**value, 'existing': False}))


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception:
        print('HML test traffic guard refused unsafe or unavailable local state.', file=sys.stderr)
        sys.exit(1)
