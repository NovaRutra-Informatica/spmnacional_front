#!/usr/bin/env python3
"""Prepare root-only Compose env files without sourcing files or exposing secrets."""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen

ROOT = Path('/opt/spm-hml')


class HmlConfigError(Exception):
    """Fixed authored validation messages, safe for operational logs."""


CONFIG_KEYS = {
    'HML_DOMAIN', 'HML_BASIC_AUTH_USER', 'GOOGLE_OAUTH_ALLOWED_DOMAIN',
    'GOOGLE_WORKSPACE_MFA_ENFORCED', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_NAME',
    'GOOGLE_OAUTH_ALLOWED_EMAILS', 'GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'MAIL_FROM', 'MAIL_NOTIFY_TO',
    'GOOGLE_CALENDAR_ID', 'TRANSLATION_ENABLED', 'TRANSLATION_DAILY_CHARACTER_LIMIT',
    'ANALYTICS_ENABLED', 'GA_MEASUREMENT_ID', 'GA_ENHANCED_MEASUREMENT_DISABLED',
}
SECRET_KEYS = {
    'AUTH_SECRET', 'ENCRYPTION_KEY', 'CRON_SECRET', 'POSTGRES_PASSWORD', 'DATABASE_URL',
    'RUNTIME_DATABASE_URL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_CALENDAR_API_KEY', 'SMTP_PASSWORD', 'HML_BASIC_AUTH_HASH',
}


def metadata(key):
    request = Request(
        'http://metadata.google.internal/computeMetadata/v1/instance/attributes/' + key,
        headers={'Metadata-Flavor': 'Google'},
    )
    with urlopen(request, timeout=10) as response:
        if response.headers.get('Metadata-Flavor') != 'Google':
            raise HmlConfigError('Metadata não confiável.')
        return response.read(65536).decode('utf-8').strip()


def env_file(path):
    values = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
            raise HmlConfigError('Arquivo env inválido: ' + path.name)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if any(ord(character) < 32 for character in value):
            raise HmlConfigError('Valor env com caractere de controle: ' + key)
        if key in values:
            raise HmlConfigError('Variável env repetida: ' + key)
        values[key] = value
    return values


def private_write(path, content):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix='.hml-')
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_env(path, values):
    # Compose env_file format: raw preserves dollar signs in OAuth/password/hash values.
    for value in values.values():
        if not isinstance(value, str) or any(ord(character) < 32 for character in value):
            raise HmlConfigError('Segredo/configuração deve ocupar uma única linha.')
    private_write(path, ''.join(f'{key}={value}\n' for key, value in values.items()))


def database_url(raw, username):
    parsed = urlparse(raw)
    query = parse_qs(parsed.query, strict_parsing=True)
    if not (
        parsed.scheme in ('postgres', 'postgresql') and parsed.hostname == 'localhost'
        and parsed.port is None and unquote(parsed.username or '') == username
        and parsed.password and parsed.path == '/spmnacional'
        and query.get('host') == ['/var/run/postgresql']
        and set(query).issubset({'host', 'schema'})
        and not parsed.fragment
    ):
        raise HmlConfigError('URL SQL HML inválida: ' + username)
    return unquote(parsed.password)


def workspace_access_config(config):
    """HML-only operational MFA declarations; never inferred from an OAuth token."""
    domain = config.get('GOOGLE_OAUTH_ALLOWED_DOMAIN', '').strip().lower()
    if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}', domain):
        raise HmlConfigError('Informe o domínio Workspace exato.')
    def single_email(key):
        email = config.get(key, '').strip().lower()
        if not email:
            return ''
        if not re.fullmatch(r'[a-z0-9][a-z0-9._%+-]{0,63}@' + re.escape(domain), email):
            raise HmlConfigError(key + ' deve conter exatamente um e-mail do domínio Workspace.')
        return email
    allowed = single_email('GOOGLE_OAUTH_ALLOWED_EMAILS')
    confirmed = single_email('GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS')
    global_mfa = config.get('GOOGLE_WORKSPACE_MFA_ENFORCED', '').strip()
    if global_mfa not in ('true', 'false'):
        raise HmlConfigError('Informe explicitamente GOOGLE_WORKSPACE_MFA_ENFORCED=true ou false.')
    if confirmed and (not allowed or confirmed != allowed):
        raise HmlConfigError('A confirmação individual de 2FA deve coincidir com a única conta autorizada.')
    if global_mfa == 'false':
        if not allowed or confirmed != allowed:
            raise HmlConfigError('HML sem política global 2FA exige uma única conta allowlist e confirmação individual idêntica.')
        if config.get('BOOTSTRAP_ADMIN_EMAIL', '').strip().lower() != allowed:
            raise HmlConfigError('BOOTSTRAP_ADMIN_EMAIL deve ser a única conta autorizada na exceção HML.')
    return domain, global_mfa, allowed, confirmed


def build_environments(config, release, attributes, secrets):
    if set(config) - CONFIG_KEYS:
        raise HmlConfigError('config.env contém chave não suportada ou segredo.')
    if set(release) - {'APP_IMAGE', 'MIGRATOR_IMAGE', 'POSTGRES_IMAGE', 'CADDY_IMAGE'}:
        raise HmlConfigError('release.env contém chave não suportada.')
    registry = (f"{attributes['hml-region']}-docker.pkg.dev/"
                f"{attributes['hml-project-id']}/{attributes['hml-artifact-repo']}/")
    for key in ('APP_IMAGE', 'MIGRATOR_IMAGE'):
        image = release.get(key, '')
        if not image.startswith(registry) or not re.fullmatch(
            re.escape(registry) + r'[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}', image,
        ):
            raise HmlConfigError(key + ' deve ser uma imagem do registro HML por digest.')
    domain = config.get('HML_DOMAIN', '')
    if not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}', domain):
        raise HmlConfigError('HML_DOMAIN deve ser um hostname DNS, sem protocolo ou caminho.')
    domain_workspace, global_mfa, allowed_email, confirmed_email = workspace_access_config(config)
    analytics_enabled = config.get('ANALYTICS_ENABLED', 'false')
    measurement_id = config.get('GA_MEASUREMENT_ID', '')
    if analytics_enabled not in ('true', 'false') or (measurement_id and not re.fullmatch(r'G-[A-Z0-9]{6,20}', measurement_id)):
        raise HmlConfigError('Configuração de Analytics inválida.')
    if analytics_enabled == 'true' and not measurement_id:
        raise HmlConfigError('Analytics exige ID de medição real.')
    enhanced_measurement_disabled = config.get('GA_ENHANCED_MEASUREMENT_DISABLED', 'false')
    if enhanced_measurement_disabled not in ('true', 'false') or (analytics_enabled == 'true' and enhanced_measurement_disabled != 'true'):
        raise HmlConfigError('Desative Enhanced Measurement na propriedade GA4 antes de ativar Analytics.')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', config.get('HML_BASIC_AUTH_USER', 'hml')):
        raise HmlConfigError('Usuário Basic HML inválido.')
    if not re.fullmatch(r'\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}', secrets['HML_BASIC_AUTH_HASH']):
        raise HmlConfigError('HML_BASIC_AUTH_HASH deve conter um hash bcrypt do Caddy.')
    owner_password = database_url(secrets['DATABASE_URL'], 'spm')
    runtime_password = database_url(secrets['RUNTIME_DATABASE_URL'], 'spm_app')
    if owner_password != secrets['POSTGRES_PASSWORD'] or owner_password == runtime_password:
        raise HmlConfigError('Credenciais SQL precisam coincidir com o owner e separar o runtime.')
    for key in ('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'):
        if not secrets.get(key, '').strip() or secrets[key] == 'PREENCHER':
            raise HmlConfigError('Credencial Workspace real ausente: ' + key)
    if release.get('POSTGRES_IMAGE') and not re.fullmatch(
        r'(?:postgres:18\.6-alpine(?:@sha256:[a-f0-9]{64})?'
        r'|southamerica-east1-docker\.pkg\.dev/site-institucional-510319/'
        r'spm-hml-docker/spm-hml-postgres@sha256:[a-f0-9]{64})', release['POSTGRES_IMAGE'],
    ):
        raise HmlConfigError('POSTGRES_IMAGE deve ser PostgreSQL 18.6 Alpine oficial ou a imagem HML autorizada por digest.')
    if release.get('CADDY_IMAGE') and not re.fullmatch(
        r'caddy:2(?:\.[0-9]+){0,2}-alpine(?:@sha256:[a-f0-9]{64})?', release['CADDY_IMAGE'],
    ):
        raise HmlConfigError('CADDY_IMAGE deve ser Caddy 2 Alpine.')

    web = {
        'NODE_ENV': 'production', 'DEPLOYMENT_TARGET': 'gcp-vm',
        'NODE_OPTIONS': '--max-old-space-size=256', 'NEXT_TELEMETRY_DISABLED': '1',
        'APP_URL': 'https://' + domain, 'NEXT_PUBLIC_SITE_URL': 'https://' + domain,
        'DB_POOL_MAX': '3', 'DATABASE_CONNECTION_TIMEOUT_MS': '5000',
        'DATABASE_QUERY_TIMEOUT_MS': '10000', 'DATABASE_URL': secrets['RUNTIME_DATABASE_URL'],
        'AUTH_SECRET': secrets['AUTH_SECRET'], 'ENCRYPTION_KEY': secrets['ENCRYPTION_KEY'],
        'CRON_SECRET': secrets['CRON_SECRET'], 'STORAGE_DRIVER': 'gcs',
        'GCS_BUCKET': attributes['hml-uploads-bucket'], 'LOCAL_TEST_AUTH_ENABLED': 'false',
        'GOOGLE_OAUTH_ALLOWED_DOMAIN': domain_workspace,
        'GOOGLE_WORKSPACE_MFA_ENFORCED': global_mfa,
        'GOOGLE_OAUTH_CLIENT_ID': secrets['GOOGLE_OAUTH_CLIENT_ID'],
        'GOOGLE_OAUTH_CLIENT_SECRET': secrets['GOOGLE_OAUTH_CLIENT_SECRET'],
        'GOOGLE_CLOUD_PROJECT': attributes['hml-project-id'], 'TRANSLATION_LOCATION': 'global',
        'TRANSLATION_ENABLED': config.get('TRANSLATION_ENABLED', 'false'),
        'TRANSLATION_DAILY_CHARACTER_LIMIT': config.get('TRANSLATION_DAILY_CHARACTER_LIMIT', '5000'),
        'ANALYTICS_ENABLED': analytics_enabled, 'GA_MEASUREMENT_ID': measurement_id,
        'GA_ENHANCED_MEASUREMENT_DISABLED': enhanced_measurement_disabled,
        # Caddy is the single HTTP reverse proxy in this deployment.
        'TRUSTED_PROXY_HOPS': '0',
    }
    if allowed_email:
        web['GOOGLE_OAUTH_ALLOWED_EMAILS'] = allowed_email
    if confirmed_email:
        web['GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS'] = confirmed_email
    if config.get('SMTP_HOST'):
        for key in ('SMTP_HOST', 'SMTP_USER', 'MAIL_FROM', 'MAIL_NOTIFY_TO'):
            if not config.get(key):
                raise HmlConfigError('Configuração SMTP incompleta: ' + key)
            web[key] = config[key]
        web.update(SMTP_PASSWORD=secrets['SMTP_PASSWORD'],
                   SMTP_PORT=config.get('SMTP_PORT', '587'),
                   SMTP_SECURE=config.get('SMTP_SECURE', 'false'))
    if config.get('GOOGLE_CALENDAR_ID'):
        web.update(GOOGLE_CALENDAR_ID=config['GOOGLE_CALENDAR_ID'],
                   GOOGLE_CALENDAR_API_KEY=secrets['GOOGLE_CALENDAR_API_KEY'])
    bootstrap = {
        'DATABASE_URL': secrets['DATABASE_URL'], 'GOOGLE_OAUTH_ALLOWED_DOMAIN': domain_workspace,
        'BOOTSTRAP_ADMIN_EMAIL': config.get('BOOTSTRAP_ADMIN_EMAIL', ''),
        'BOOTSTRAP_ADMIN_NAME': config.get('BOOTSTRAP_ADMIN_NAME', 'Administrador SPM HML'),
    }
    return {
        'web.env': web,
        'db.env': {'POSTGRES_USER': 'spm', 'POSTGRES_DB': 'spmnacional',
                   'POSTGRES_PASSWORD': secrets['POSTGRES_PASSWORD'],
                   'POSTGRES_INITDB_ARGS': '--auth-local=scram-sha-256 --auth-host=scram-sha-256'},
        'migrator.env': {'DATABASE_URL': secrets['DATABASE_URL']},
        'provision.env': {'DATABASE_URL': secrets['DATABASE_URL'],
                          'RUNTIME_DATABASE_URL': secrets['RUNTIME_DATABASE_URL']},
        'bootstrap.env': bootstrap,
        'gateway.env': {'HML_DOMAIN': domain,
                        'HML_BASIC_AUTH_USER': config.get('HML_BASIC_AUTH_USER', 'hml'),
                        'HML_BASIC_AUTH_HASH': secrets['HML_BASIC_AUTH_HASH']},
    }


def main():
    if os.geteuid() != 0:
        raise HmlConfigError('Execute configure.py como root na VM.')
    config = env_file(ROOT / 'config.env')
    release = env_file(ROOT / 'release.env')
    # Validate global policy or the authorized single-account HML exception first.
    workspace_access_config(config)
    attributes = {key: metadata(key) for key in (
        'hml-project-id', 'hml-region', 'hml-prefix', 'hml-uploads-bucket',
        'hml-backups-bucket', 'hml-artifact-repo',
    )}
    for value in attributes.values():
        if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{1,220}', value):
            raise HmlConfigError('Metadata HML inválida.')
    secret_map = json.loads(metadata('hml-secret-map'))
    if not isinstance(secret_map, dict) or set(secret_map) - SECRET_KEYS:
        raise HmlConfigError('Mapa de segredos HML inválido.')
    required = SECRET_KEYS - {'GOOGLE_CALENDAR_API_KEY', 'SMTP_PASSWORD'}
    if config.get('SMTP_HOST'):
        required.add('SMTP_PASSWORD')
    if config.get('GOOGLE_CALENDAR_ID'):
        required.add('GOOGLE_CALENDAR_API_KEY')
    versions_path = ROOT / 'secret-versions.json'
    versions = json.loads(versions_path.read_text()) if versions_path.exists() else {}
    secrets = {}
    for key in sorted(required):
        secret_id = secret_map.get(key, '')
        if not re.fullmatch(re.escape(attributes['hml-prefix']) + r'-[a-z0-9-]+', secret_id):
            raise HmlConfigError('ID de segredo HML inválido: ' + key)
        version = str(versions.get(key, 'latest'))
        if version != 'latest' and not re.fullmatch(r'[1-9][0-9]*', version):
            raise HmlConfigError('Versão de segredo inválida: ' + key)
        # Access alone returns the resolved version name and payload. No versions.get
        # permission is needed; the VM retains only secretAccessor on each secret.
        result = subprocess.run(
            ['gcloud', 'secrets', 'versions', 'access', version, '--secret', secret_id,
             '--project', attributes['hml-project-id'], '--format=json', '--quiet'],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        response = json.loads(result.stdout)
        resolved_version = response['name'].rsplit('/', 1)[-1]
        if not re.fullmatch(r'[1-9][0-9]*', resolved_version):
            raise HmlConfigError('Segredo sem versão real: ' + key)
        encoded = response['payload']['data'].replace('_', '/').replace('-', '+')
        secrets[key] = base64.b64decode(encoded, validate=True).decode('utf-8').rstrip('\r\n')
        versions[key] = resolved_version
    environments = build_environments(config, release, attributes, secrets)
    for filename, values in environments.items():
        write_env(ROOT / 'generated' / filename, values)
    write_env(ROOT / 'compose.env', release)
    private_write(ROOT / 'metadata.json', json.dumps(attributes, indent=2) + '\n')
    private_write(versions_path, json.dumps(versions, indent=2, sort_keys=True) + '\n')
    print('Arquivos HML protegidos preparados; versões de segredos fixadas.')


if __name__ == '__main__':
    try:
        main()
    except HmlConfigError as error:
        # Only validation errors authored above; never raw cloud/DB exceptions.
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('Falha ao preparar configuração/segredos HML. Revise IAM e versões no projeto.', file=sys.stderr)
        sys.exit(1)
