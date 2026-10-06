#!/usr/bin/env python3
"""Run the actual Bash backup in root-only disposable fixtures; no GCP/SSH."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid

DIRECTORY = Path(__file__).parent
SHELL = (DIRECTORY / 'backup-verify.sh').read_text()
HELPER = (DIRECTORY / 'backup-verify.py').read_text()
SQL = (DIRECTORY / 'backup-integrity.sql').read_text()
DOCKER = shutil.which('docker.exe') or shutil.which('docker')
assert os.geteuid() == 0, 'Requires root only for protected fixture permissions.'
assert SHELL.count('source /opt/spm-hml/common.sh') == 1
assert HELPER.count("ROOT = Path('/opt/spm-hml')") == 1

FAKE_COMPOSE = r'''
import json, os, re, subprocess, sys
from pathlib import Path
p=Path(__file__).parent
args=sys.argv[1:]
options=json.loads((p/'options.json').read_text())
def event(value):
    with (p/'events').open('a') as stream: stream.write(value+'\n')
def fail(value):
    sys.stderr.write('synthetic-provider-secret-must-not-print\n')
    sys.exit(value)
if args[0]=='stop':
    assert not (p/'state/deployment-ready').exists()
    event('stop')
    if options.get('stop_failure'): fail(9)
    sys.exit(0)
if args[0]=='ps':
    event('ps')
    if options.get('still_running'): print('web')
    sys.exit(0)
assert args[:3]==['exec','-T','db']
command=args[3:]
data=sys.stdin.buffer.read()
text=data.decode(errors='replace')
wrapped=' '.join(command)
is_psql='exec psql ' in wrapped
db=command[-1] if is_psql else None
integrity=is_psql and 'Unsupported external data or large objects' in text
if is_psql:
    if 'DROP DATABASE' in text: event('drop:'+re.search(r'DROP DATABASE "([a-z0-9_]+)"',text).group(1))
    elif 'CREATE DATABASE' in text: event('create')
    elif integrity: event('snapshot:'+db)
    else: event('sql')
elif 'pg_dump ' in wrapped: event('dump')
elif command[0]=='pg_restore' or 'pg_restore ' in wrapped: event('restore')
elif 'df -Pk' in wrapped: event('space')
else: raise AssertionError('Unknown operation')
if is_psql and 'DROP DATABASE' in text and options.get('drop_failure'): fail(11)
if 'pg_dump ' in wrapped and options.get('dump_failure'): fail(7)
if '--single-transaction' in wrapped and options.get('restore_failure'): fail(8)
if options.get('real'):
    docker=options['docker']; container=options['container']
    if integrity and options.get('tamper_restored') and db.startswith('spm_verify_'):
        edit=['sh','-c','export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -q -h /var/run/postgresql -U spm -d "$1" -c "UPDATE public.fixture SET amount=amount+1 WHERE id=1"','sh',db]
        subprocess.run([docker,'exec','-i',container,*edit],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    result=subprocess.run([docker,'exec','-i',container,*command],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    sys.stdout.buffer.write(result.stdout); sys.stderr.buffer.write(result.stderr); sys.exit(result.returncode)
if not is_psql:
    if 'df -Pk' in wrapped: print('100000000')
    elif 'pg_dump ' in wrapped: sys.stdout.buffer.write(b'PGDMP_SYNTHETIC')
    sys.exit(0)
if integrity:
    counter=p/'snapshot-counter'; n=int(counter.read_text())+1 if counter.exists() else 1; counter.write_text(str(n))
    changed=(db.startswith('spm_verify_') and options.get('tamper_restored')) or (n==3 and options.get('source_changed'))
    print(json.dumps({'kind':'table','schema':'public','name':'fixture','rows':2,'sha256':('b' if changed else 'a')*64}))
    print(json.dumps({'kind':'sequence','schema':'public','name':'fixture_id_seq','last_value':'2','is_called':True}))
elif 'current_database() ||' in text: print('unexpected:owner' if options.get('wrong_identity') else 'spmnacional:spm')
elif 'pg_database_size' in text: print('999999999999999999' if options.get('no_space') else '1048576')
elif 'SELECT count(*) FROM pg_database' in text: print('0' if 'AND oid=' not in text else ('0' if options.get('foreign_temporary') else '1'))
elif 'SELECT oid FROM pg_database' in text: print('4242')
else: assert 'CREATE DATABASE' in text or 'COMMENT ON DATABASE' in text or 'DROP DATABASE' in text
'''


class Fixture:
    def __init__(self, **options):
        self.temporary = tempfile.TemporaryDirectory(prefix='spm-local-backup-test-')
        self.root = Path(self.temporary.name)
        self.root.chmod(0o700)
        for name in ['state', 'backups']:
            (self.root / name).mkdir(mode=0o700)
        for name, content in [('metadata.json', json.dumps({'hml-project-id':'site-institucional-510319','hml-region':'southamerica-east1'})),
                              ('state/deployment-ready','old-common-ready-marker'),('options.json',json.dumps(options))]:
            (self.root / name).write_text(content); (self.root / name).chmod(0o600)
        (self.root / 'backup-verify.py').write_text(HELPER.replace("ROOT = Path('/opt/spm-hml')",f'ROOT = Path({str(self.root)!r})'))
        (self.root / 'backup-integrity.sql').write_text(SQL)
        (self.root / 'fake-compose.py').write_text(FAKE_COMPOSE)
        common=self.root / 'common.sh'
        # No configuration_exists, ready_signature, deployment_ready or new helpers.
        common.write_text(f"HML_ROOT='{self.root}'\nrequire_root() {{ [[ $EUID -eq 0 ]]; }}\ncompose() {{ python3 '{self.root}/fake-compose.py' \"$@\"; }}\n")
        self.script=self.root / 'backup-verify.sh'
        self.script.write_text(SHELL.replace('source /opt/spm-hml/common.sh',f"source '{common}'")
                               .replace('flock -w 30 -x 8','flock -w 0 -x 8'))

    def run(self):
        return subprocess.run(['bash',str(self.script)],capture_output=True,text=True,timeout=180,
                              env={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'})

    def events(self):
        path=self.root/'events'
        return path.read_text().splitlines() if path.exists() else []

    def folder(self):
        return next((self.root/'backups').iterdir())

    def close(self): self.temporary.cleanup()


checks=0
def check(condition):
    global checks
    assert condition
    checks+=1


def mocked():
    f=Fixture()
    try:
        result=f.run(); check(result.returncode==0)
        output=json.loads(result.stdout); check(output['verified'] and output['source_unchanged'])
        check(not (f.root/'state/deployment-ready').exists())
        events=f.events(); check(events[0:2]==['stop','ps'])
        check(events.index('dump')>next(i for i,e in enumerate(events) if e.startswith('snapshot:')))
        check(sum(e.startswith('drop:spm_verify_') for e in events)==1)
        check('start' not in events and 'up' not in events)
        proof=json.loads((f.folder()/'proof.json').read_text()); check(proof['temporary_database_removed'])
        check(proof['objects'][0]['last_value']=='2' and proof['objects'][1]['rows']==2)
        check(json.loads((f.folder()/'temporary.identity.json').read_text())['oid']==4242)
        for path in f.folder().iterdir(): check(stat.S_IMODE(path.stat().st_mode)==0o600)
        check(stat.S_IMODE(f.folder().stat().st_mode)==0o700)
    finally: f.close()
    for failure, expects_drop in [('stop_failure',False),('still_running',False),('wrong_identity',False),('no_space',False),
                                  ('dump_failure',False),('restore_failure',True),('tamper_restored',True),('source_changed',True),
                                  ('foreign_temporary',False),('drop_failure',True)]:
        f=Fixture(**{failure:True})
        try:
            result=f.run(); check(result.returncode!=0)
            check('synthetic-provider-secret' not in result.stdout+result.stderr)
            check(not (f.root/'state/deployment-ready').exists())
            check(not (f.folder()/'proof.json').exists())
            check(any(e.startswith('drop:spm_verify_') for e in f.events())==expects_drop)
        finally: f.close()
    for unsafe in ['wrong_project','state_permissions','lock_symlink','marker_hardlink','backup_symlink']:
        f=Fixture()
        try:
            if unsafe=='wrong_project': (f.root/'metadata.json').write_text('{}')
            elif unsafe=='state_permissions': (f.root/'state').chmod(0o755)
            elif unsafe=='lock_symlink': (f.root/'state/deploy.lock').symlink_to(f.root/'metadata.json')
            elif unsafe=='marker_hardlink': os.link(f.root/'state/deployment-ready',f.root/'hardlink')
            else: (f.root/'backups').rmdir(); (f.root/'backups').symlink_to(f.root/'state')
            result=f.run(); check(result.returncode!=0); check(f.events()==[])
        finally: f.close()
    for lock_name in ['deploy.lock','backup.lock']:
        f=Fixture()
        try:
            path=f.root/'state'/lock_name
            with path.open('w') as lock:
                path.chmod(0o600); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                result=f.run(); check(result.returncode!=0); check(f.events()==[])
                check((f.root/'state/deployment-ready').exists())
        finally: f.close()


def postgres():
    assert DOCKER, 'Docker is required; no automatic download is performed.'
    image='postgres:18.6-alpine'
    subprocess.run([DOCKER,'image','inspect',image],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    container='spm-backup-proof-test-'+uuid.uuid4().hex
    env=dict(os.environ,POSTGRES_PASSWORD='synthetic_fixture_only_'+uuid.uuid4().hex)
    if DOCKER.endswith('.exe'):
        # WSL interoperability only propagates explicitly named environment vars.
        env['WSLENV']=env.get('WSLENV','')+':POSTGRES_PASSWORD/u'
    subprocess.run([DOCKER,'run','--detach','--pull','never','--network','none','--name',container,
                    '--tmpfs','/var/lib/postgresql:rw,nosuid,size=512m','--memory','256m','--cpus','1',
                    '-e','POSTGRES_PASSWORD','-e','POSTGRES_HOST_AUTH_METHOD=trust',
                    '-e','POSTGRES_USER=spm','-e','POSTGRES_DB=spmnacional',image,
                    'postgres','-c',"listen_addresses=",'-c','unix_socket_directories=/var/run/postgresql'],
                   env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    def sql(query):
        result=subprocess.run([DOCKER,'exec','-i',container,'sh','-c',
                               'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -q -A -t -v ON_ERROR_STOP=1 -h /var/run/postgresql -U spm -d spmnacional'],
                              input=query.encode(),capture_output=True,timeout=30)
        assert result.returncode==0, 'Isolated PostgreSQL fixture operation failed.'
        return result.stdout.decode().strip()
    try:
        for _ in range(60):
            ready=subprocess.run([DOCKER,'exec',container,'pg_isready','-h','/var/run/postgresql','-U','spm'],capture_output=True)
            if ready.returncode==0: break
            state=subprocess.run([DOCKER,'inspect','--format','{{.State.Status}}',container],capture_output=True)
            assert state.stdout.strip()!=b'exited', 'Disposable PostgreSQL exited during initialization.'
            time.sleep(0.5)
        else: raise AssertionError('Isolated PostgreSQL did not start.')
        sql("CREATE TABLE fixture(id BIGSERIAL PRIMARY KEY, amount NUMERIC(20,5), payload JSONB, data BYTEA, created TIMESTAMPTZ); INSERT INTO fixture(amount,payload,data,created) VALUES(12.25,'{\"unicode\":\"ç\",\"null\":null}',decode('00ff','hex'),'2026-10-02T22:00:00Z'),(NULL,NULL,NULL,NULL); CREATE TABLE duplicates(value TEXT); INSERT INTO duplicates VALUES('same'),('same'); CREATE TABLE empty_table(id UUID); CREATE MATERIALIZED VIEW materialized AS SELECT id,amount FROM fixture; CREATE SCHEMA quoted; CREATE TABLE quoted.\"Odd '' name\"(value TEXT); INSERT INTO quoted.\"Odd '' name\" VALUES('data must never print');")
        source_count=sql('SELECT count(*) FROM fixture;')
        for tamper in [False,True]:
            f=Fixture(real=True,docker=DOCKER,container=container,tamper_restored=tamper)
            try:
                result=f.run(); check((result.returncode==0)==(not tamper))
                check('data must never print' not in result.stdout+result.stderr)
                check(sql('SELECT count(*) FROM fixture;')==source_count)
                check(sql("SELECT count(*) FROM pg_database WHERE datname LIKE 'spm_verify_%';")=='0')
                check(not (f.root/'state/deployment-ready').exists())
                if not tamper:
                    proof=json.loads((f.folder()/'proof.json').read_text())
                    check(len(proof['objects'])==6)
                    check(any(v.get('rows')==0 and v['name']=='empty_table' for v in proof['objects']))
                    check(any(v['name']=="Odd '' name" for v in proof['objects']))
            finally: f.close()
        sql('CREATE TABLE many_rows(value TEXT); INSERT INTO many_rows SELECT (i%100)::text FROM generate_series(1,2500) i;')
        f=Fixture(real=True,docker=DOCKER,container=container)
        try:
            result=f.run(); check(result.returncode==0)
            proof=json.loads((f.folder()/'proof.json').read_text())
            check(next(v for v in proof['objects'] if v['name']=='many_rows')['rows']==2500)
        finally: f.close()
    finally:
        subprocess.run([DOCKER,'rm','--force',container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)


mocked()
if sys.argv[1:]==['--real-postgres']: postgres()
elif sys.argv[1:]: raise SystemExit('Usage: check-backup-verify.py [--real-postgres]')
print(f'{checks} backup/restore checks passed; no GCP, host SQL or external network.')
