#!/usr/bin/env python3
"""Synthetic operational checks; never reads .env, credentials, or a real database."""
import ast
import base64
import copy
import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import uuid

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hml_config', ROOT / 'configure.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

attributes = {
    'hml-project-id': 'synthetic-hml', 'hml-region': 'southamerica-east1',
    'hml-prefix': 'spm-hml', 'hml-artifact-repo': 'spm-hml-docker',
    'hml-uploads-bucket': 'synthetic-hml-uploads', 'hml-backups-bucket': 'synthetic-hml-backups',
}
registry = 'southamerica-east1-docker.pkg.dev/synthetic-hml/spm-hml-docker/'
release = {
    'APP_IMAGE': registry + 'site@sha256:' + 'a' * 64,
    'MIGRATOR_IMAGE': registry + 'migrate@sha256:' + 'b' * 64,
}
config = {
    'HML_DOMAIN': 'hml.example.test', 'GOOGLE_OAUTH_ALLOWED_DOMAIN': 'example.test',
    'GOOGLE_WORKSPACE_MFA_ENFORCED': 'true', 'BOOTSTRAP_ADMIN_EMAIL': 'admin@example.test',
}
# Public example hash from Caddy's documentation; all other values are synthetic.
secrets = {
    'AUTH_SECRET': 'synthetic-auth-secret-for-configuration-tests-only',
    'ENCRYPTION_KEY': base64.b64encode(bytes(range(32))).decode('ascii'),
    'CRON_SECRET': 'synthetic-cron-secret-for-configuration-tests-only',
    'POSTGRES_PASSWORD': 'owner-password@synthetic',
    'DATABASE_URL': 'postgresql://spm:owner-password%40synthetic@localhost/spmnacional?host=/var/run/postgresql&schema=public',
    'RUNTIME_DATABASE_URL': 'postgresql://spm_app:runtime-password%40synthetic@localhost/spmnacional?host=/var/run/postgresql&schema=public',
    'GOOGLE_OAUTH_CLIENT_ID': 'synthetic-oauth-id',
    'GOOGLE_OAUTH_CLIENT_SECRET': 'synthetic-oauth-secret',
    'HML_BASIC_AUTH_HASH': '$2a$14$Zkx19XLiW6VYouLHR5NmfOFU0z2GTNmpkT/5qqR7hx4IjWJPDhjvG',
}

ast.parse((ROOT / 'configure.py').read_text(encoding='utf-8'))
environments = module.build_environments(config, release, attributes, secrets)
assert environments['web.env']['DATABASE_URL'] == secrets['RUNTIME_DATABASE_URL']
assert 'POSTGRES_PASSWORD' not in environments['web.env']
assert 'RUNTIME_DATABASE_URL' not in environments['web.env']
assert environments['migrator.env'] == {'DATABASE_URL': secrets['DATABASE_URL']}
assert environments['db.env']['POSTGRES_INITDB_ARGS'] == '--auth-local=scram-sha-256 --auth-host=scram-sha-256'
checks = 5
assert environments['web.env']['ANALYTICS_ENABLED'] == 'false'
assert environments['web.env']['GA_MEASUREMENT_ID'] == ''
assert module.build_environments({**config, 'ANALYTICS_ENABLED': 'true', 'GA_MEASUREMENT_ID': 'G-TEST123456', 'GA_ENHANCED_MEASUREMENT_DISABLED': 'true'}, release, attributes, secrets)['web.env']['GA_MEASUREMENT_ID'] == 'G-TEST123456'
checks += 3
postgres_registry = 'southamerica-east1-docker.pkg.dev/site-institucional-510319/spm-hml-docker/'
for image in (
    'postgres:18.6-alpine',
    'postgres:18.6-alpine@sha256:' + 'c' * 64,
    postgres_registry + 'spm-hml-postgres@sha256:' + 'd' * 64,
):
    postgres_environments = module.build_environments(config, {**release, 'POSTGRES_IMAGE': image}, attributes, secrets)
    assert postgres_environments['db.env'] == environments['db.env']
    assert postgres_environments['web.env'] == environments['web.env']
    checks += 1
for image in (
    'postgres:18.6',
    'postgres:19-alpine',
    'postgres:18.6-alpine@sha256:' + 'c' * 63,
    postgres_registry + 'spm-hml-postgres:latest',
    postgres_registry + 'spm-hml-postgres:hardened',
    postgres_registry + 'spm-hml-postgres:hardened@sha256:' + 'd' * 64,
    postgres_registry + 'spm-hml-postgres@sha256:' + 'D' * 64,
    postgres_registry + 'spm-hml-postgres@sha256:' + 'd' * 63,
    postgres_registry.replace('site-institucional-510319', 'other-project') + 'spm-hml-postgres@sha256:' + 'd' * 64,
    postgres_registry.replace('spm-hml-docker', 'other-repository') + 'spm-hml-postgres@sha256:' + 'd' * 64,
    postgres_registry.replace('southamerica-east1', 'us-central1') + 'spm-hml-postgres@sha256:' + 'd' * 64,
    postgres_registry + 'other-image@sha256:' + 'd' * 64,
    postgres_registry + 'spm-hml-postgres@sha256:' + 'd' * 64 + '/suffix',
    ' ' + postgres_registry + 'spm-hml-postgres@sha256:' + 'd' * 64,
):
    try:
        module.build_environments(config, {**release, 'POSTGRES_IMAGE': image}, attributes, secrets)
    except module.HmlConfigError:
        checks += 1
    else:
        raise AssertionError('Imagem PostgreSQL não autorizada aceita.')
for target, key, value in (
    ('config', 'GOOGLE_WORKSPACE_MFA_ENFORCED', 'false'),
    ('config', 'LOCAL_TEST_AUTH_ENABLED', 'true'),
    ('config', 'ANALYTICS_ENABLED', 'true'),
    ('config', 'ANALYTICS_ENABLED', 'yes'),
    ('config', 'GA_MEASUREMENT_ID', 'G-invalid<script>'),
    ('release', 'APP_IMAGE', registry + 'site:latest'),
    ('secrets', 'GOOGLE_OAUTH_CLIENT_SECRET', ''),
    ('secrets', 'HML_BASIC_AUTH_HASH', 'plaintext'),
    ('secrets', 'RUNTIME_DATABASE_URL', secrets['DATABASE_URL']),
    ('secrets', 'DATABASE_URL', 'postgresql://spm:owner-password%40synthetic@db/spmnacional?host=/var/run/postgresql'),
):
    inputs = {'config': copy.deepcopy(config), 'release': copy.deepcopy(release), 'secrets': copy.deepcopy(secrets)}
    inputs[target][key] = value
    try:
        module.build_environments(inputs['config'], inputs['release'], attributes, inputs['secrets'])
    except module.HmlConfigError:
        checks += 1
    else:
        raise AssertionError('Configuração inválida aceita: ' + key)

individual_config = {
    **config, 'GOOGLE_WORKSPACE_MFA_ENFORCED': 'false',
    'GOOGLE_OAUTH_ALLOWED_EMAILS': 'admin@example.test',
    'GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS': 'admin@example.test',
}
individual_environments = module.build_environments(individual_config, release, attributes, secrets)
assert individual_environments['web.env']['GOOGLE_WORKSPACE_MFA_ENFORCED'] == 'false'
assert individual_environments['web.env']['GOOGLE_OAUTH_ALLOWED_EMAILS'] == 'admin@example.test'
assert individual_environments['web.env']['GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS'] == 'admin@example.test'
checks += 3
for key, value in (
    ('GOOGLE_OAUTH_ALLOWED_EMAILS', ''),
    ('GOOGLE_OAUTH_ALLOWED_EMAILS', 'admin@example.test,other@example.test'),
    ('GOOGLE_OAUTH_ALLOWED_EMAILS', '*@example.test'),
    ('GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS', ''),
    ('GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS', 'other@example.test'),
    ('GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS', 'admin@example.test;other@example.test'),
    ('GOOGLE_WORKSPACE_MFA_ENFORCED', ''),
    ('BOOTSTRAP_ADMIN_EMAIL', ''),
    ('BOOTSTRAP_ADMIN_EMAIL', 'other@example.test'),
):
    try:
        module.build_environments({**individual_config, key: value}, release, attributes, secrets)
    except module.HmlConfigError:
        checks += 1
    else:
        raise AssertionError('Exceção HML indevida aceita: ' + key)

with tempfile.TemporaryDirectory(prefix='spm-hml-configcheck-') as directory:
    path = pathlib.Path(directory)
    for name, values in environments.items():
        module.write_env(path / 'generated' / name, values)
    assert (path / 'generated' / 'gateway.env').read_text().split('HML_BASIC_AUTH_HASH=', 1)[1].strip() == secrets['HML_BASIC_AUTH_HASH']
    checks += 1
    if '--docker' in sys.argv:
        for filename in ('docker-compose.yml', 'Caddyfile'):
            shutil.copy(ROOT / filename, path / filename)
        module.write_env(path / 'compose.env', release)
        project = 'spm-hml-configcheck-' + uuid.uuid4().hex[:12]
        command = ['docker', 'compose', '--project-name', project, '--profile', '*',
                   '--env-file', str(path / 'compose.env'), '-f', str(path / 'docker-compose.yml')]
        result = subprocess.run(command + ['config', '--format', 'json'],
                                capture_output=True, text=True, check=True)
        rendered = json.loads(result.stdout)
        # The config serializer escapes dollar signs for a reusable Compose document.
        assert rendered['services']['gateway']['environment']['HML_BASIC_AUTH_HASH'].replace('$$', '$') == secrets['HML_BASIC_AUTH_HASH']
        assert rendered['services']['web']['environment']['DATABASE_URL'] == secrets['RUNTIME_DATABASE_URL']
        checks += 2
        try:
            # Actual Compose env_file injection, isolated project; no published ports.
            subprocess.run(command + ['run', '--rm', '--no-deps', 'gateway', 'caddy',
                                      'validate', '--config', '/etc/caddy/Caddyfile'],
                           check=True, stdout=subprocess.DEVNULL)
            checks += 1
        finally:
            subprocess.run(command + ['down', '--volumes'], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print(f'Config HML: {checks} verificações passaram; somente dados sintéticos.')
