#!/usr/bin/env python3
"""Protected local evidence for the HML maintenance backup, never row contents."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import uuid

ROOT = Path('/opt/spm-hml')
PROJECT = 'site-institucional-510319'
NAME = re.compile(r'pre-76-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{32}')


def directory(path):
    value = path.lstat()
    if not (stat.S_ISDIR(value.st_mode) and value.st_uid == 0
            and stat.S_IMODE(value.st_mode) == 0o700):
        raise ValueError('Unprotected directory')


def protected_file(path, optional=False):
    try:
        value = path.lstat()
    except FileNotFoundError:
        if optional:
            return
        raise
    if not (stat.S_ISREG(value.st_mode) and value.st_uid == 0
            and stat.S_IMODE(value.st_mode) == 0o600 and value.st_nlink == 1):
        raise ValueError('Unprotected file')


def identity():
    for path in [ROOT, ROOT / 'state', ROOT / 'backups']:
        directory(path)
    protected_file(ROOT / 'metadata.json')
    metadata = json.loads((ROOT / 'metadata.json').read_text())
    if metadata.get('hml-project-id') != PROJECT or metadata.get('hml-region') != 'southamerica-east1':
        raise ValueError('Not the approved HML project')
    for name in ['deploy.lock', 'backup.lock', 'deployment-ready']:
        protected_file(ROOT / 'state' / name, optional=True)


def folder(value):
    result = Path(value)
    if result.parent != ROOT / 'backups' or not NAME.fullmatch(result.name):
        raise ValueError('Unexpected backup path')
    directory(result)
    return result


def snapshot(path):
    protected_file(path)
    if path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('Evidence too large')
    result = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    seen = set()
    for row in result:
        key = (row.get('kind'), row.get('schema'), row.get('name'))
        if key in seen or not all(isinstance(item, str) and item for item in key):
            raise ValueError('Invalid or duplicate object')
        seen.add(key)
        if row['kind'] == 'table':
            if set(row) != {'kind', 'schema', 'name', 'rows', 'sha256'} or type(row['rows']) is not int \
                    or row['rows'] < 0 or not re.fullmatch('[a-f0-9]{64}', row['sha256']):
                raise ValueError('Invalid table evidence')
        elif row['kind'] == 'sequence':
            if set(row) != {'kind', 'schema', 'name', 'last_value', 'is_called'} \
                    or not re.fullmatch('-?[0-9]+', row['last_value']) or type(row['is_called']) is not bool:
                raise ValueError('Invalid sequence evidence')
        else:
            raise ValueError('Unexpected object type')
    if not any(row['kind'] == 'table' for row in result):
        raise ValueError('Empty database evidence')
    return sorted(result, key=lambda row: (row['kind'], row['schema'], row['name']))


def write_new(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=True, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def digest(path):
    protected_file(path)
    value = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            value.update(chunk)
    return value.hexdigest()


def main():
    mode = sys.argv[1]
    if mode == 'identity':
        identity()
    elif mode == 'prepare':
        identity()
        token = uuid.uuid4().hex
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        target = ROOT / 'backups' / f'pre-76-{stamp}-{token}'
        target.mkdir(mode=0o700)
        request = {'directory': str(target), 'token': token, 'temporary_database': 'spm_verify_' + token,
                   'source_database': 'spmnacional', 'project': PROJECT, 'started_utc': stamp}
        write_new(target / 'request.json', request)
        print(json.dumps(request))
    elif mode == 'bind':
        target = folder(sys.argv[2])
        protected_file(target / 'request.json')
        request = json.loads((target / 'request.json').read_text())
        if not re.fullmatch('[0-9]+', sys.argv[3]) or int(sys.argv[3]) <= 0:
            raise ValueError('Invalid database OID')
        write_new(target / 'temporary.identity.json', {
            'database': request['temporary_database'], 'oid': int(sys.argv[3]),
            'comment': 'SPM backup verification:' + request['token']})
    elif mode == 'space':
        target = folder(sys.argv[2])
        size, database_free_kib = int(sys.argv[3]), int(sys.argv[4])
        # Keep room for a custom dump, restored data/indexes and hash-sort spill.
        required = 3 * size + 256 * 1024 * 1024
        if size < 0 or shutil.disk_usage(target).free < required or database_free_kib * 1024 < required:
            raise ValueError('Insufficient free space')
    elif mode == 'compare':
        target = folder(sys.argv[2])
        before, restored, after = [snapshot(target / name) for name in
                                   ['source.before.jsonl', 'restored.jsonl', 'source.after.jsonl']]
        if before != restored or before != after:
            raise ValueError('Backup restore differs or live database changed')
        dump = target / 'database.dump'
        if dump.stat().st_size == 0:
            raise ValueError('Empty backup')
        proof = {'format': 1, 'project': PROJECT, 'source_database': 'spmnacional',
                 'algorithm': 'jsonb-row-sha256-sorted-1024-v1',
                 'dump_bytes': dump.stat().st_size, 'dump_sha256': digest(dump),
                 'source_unchanged': True, 'restored_matches': True, 'objects': before,
                 'verified_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        write_new(target / 'comparison.json', proof)
    elif mode == 'complete':
        target = folder(sys.argv[2])
        protected_file(target / 'comparison.json')
        proof = json.loads((target / 'comparison.json').read_text())
        proof.update({'verified': True, 'temporary_database_removed': True,
                      'gateway_stopped': True, 'web_stopped': True, 'readiness_removed': True})
        write_new(target / 'proof.json', proof)
        print(json.dumps({'verified': True, 'backup_path': str(target / 'database.dump'),
                          'proof_path': str(target / 'proof.json'), 'source_unchanged': True,
                          'temporary_database_removed': True, 'gateway_stopped': True, 'web_stopped': True}))
    else:
        raise ValueError('Unknown operation')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Verificação local do backup falhou; consulte os arquivos protegidos, sem reabrir o site.')
