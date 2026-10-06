import { inspectWorkspaceAuthEnvironment } from './workspace-auth';
import { readTranslationConfig } from '@/lib/i18n/translation-config';
import { readAnalyticsConfig } from './analytics';

/** Validação pura: compartilhada pelo preflight, inicialização e testes, sem ler .env. */
export interface ConfigurationReport {
    errors: string[];
    warnings: string[];
}

const placeholder = /^(?:change.?me|replace.?me|dev-|sua[_ -]|your[_ -]|placeholder|preencher)/i;
const validInteger = (value: string, min: number, max: number) =>
    /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;

export function inspectRuntimeEnvironment(
    source: Record<string, string | undefined>,
): ConfigurationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const workspace = inspectWorkspaceAuthEnvironment(source);
    errors.push(...workspace.errors);
    warnings.push(...workspace.warnings);
    try { readAnalyticsConfig(source); }
    catch { errors.push('Configuração de Analytics inválida: revise ativação e ID de medição.'); }
    for (const key of Object.keys(source)) {
        if (key.startsWith('NEXT_PUBLIC_') && !['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_STATIC_DEMO'].includes(key)) {
            errors.push('Variável pública não autorizada: mantenha credenciais somente no servidor.');
        }
    }
    try {
        readTranslationConfig(source);
    } catch {
        errors.push(
            'Configuração de tradução inválida: revise ativação, projeto, região e limite diário.',
        );
    }
    const value = (key: string) => source[key]?.trim() ?? '';
    const target = value('DEPLOYMENT_TARGET') || (value('K_SERVICE') ? 'gcp' : 'local');
    const cloud = target === 'gcp' || target === 'gcp-vm';
    if (!['local', 'gcp', 'gcp-vm'].includes(target))
        errors.push('DEPLOYMENT_TARGET deve ser local, gcp ou gcp-vm.');
    let appUrl: URL | undefined;
    try {
        appUrl = new URL(value('APP_URL'));
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname);
        if (
            (appUrl.protocol !== 'https:' &&
                !(target === 'local' && loopback && appUrl.protocol === 'http:')) ||
            appUrl.username ||
            appUrl.password ||
            appUrl.search ||
            appUrl.hash ||
            appUrl.pathname !== '/'
        )
            throw new Error();
    } catch {
        errors.push('APP_URL deve ser uma origem HTTPS válida (HTTP somente em localhost local).');
    }
    if (
        appUrl &&
        value('NEXT_PUBLIC_SITE_URL') &&
        value('NEXT_PUBLIC_SITE_URL').replace(/\/$/, '') !== appUrl.origin
    ) {
        errors.push('NEXT_PUBLIC_SITE_URL e APP_URL devem apontar para a mesma origem.');
    }
    try {
        const database = new URL(value('DATABASE_URL'));
        if (
            !['postgres:', 'postgresql:'].includes(database.protocol) ||
            !database.pathname.slice(1) ||
            !database.username ||
            !database.password ||
            /SUA_SENHA|placeholder/i.test(database.password)
        )
            throw new Error();
        const sslMode = database.searchParams.get('sslmode') || value('PGSSLMODE');
        if (sslMode === 'no-verify' || database.searchParams.get('ssl') === 'no-verify')
            errors.push('DATABASE_URL não pode desativar a verificação do certificado TLS.');
        // pg usa a última ocorrência; parâmetros duplicados não podem contornar o preflight.
        if (
            cloud &&
            ['host', 'sslmode', 'ssl'].some((key) => database.searchParams.getAll(key).length > 1)
        )
            errors.push('DATABASE_URL não deve repetir parâmetros de host ou TLS na nuvem.');
        const host = database.searchParams.get('host') || decodeURIComponent(database.hostname);
        const cloudSqlSocket = /^\/cloudsql\/[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/.test(host);
        const vmSocket =
            target === 'gcp-vm' &&
            !value('K_SERVICE') &&
            !value('K_REVISION') &&
            database.hostname === 'localhost' &&
            host === '/var/run/postgresql';
        if (cloud && host.startsWith('/') && !cloudSqlSocket && !vmSocket)
            errors.push('DATABASE_URL usa um caminho de socket PostgreSQL não autorizado.');
        if (cloud && !cloudSqlSocket && !vmSocket && sslMode !== 'verify-full')
            errors.push(
                target === 'gcp-vm'
                    ? 'Na VM GCP, use o socket privado /var/run/postgresql em localhost, socket Cloud SQL ou sslmode=verify-full para conexão TCP PostgreSQL.'
                    : 'No GCP, use socket Cloud SQL ou sslmode=verify-full para conexão TCP PostgreSQL.',
            );
    } catch {
        errors.push('DATABASE_URL deve apontar para PostgreSQL com banco e credenciais definidos.');
    }
    if (value('NODE_TLS_REJECT_UNAUTHORIZED') === '0' || value('PGSSLMODE') === 'no-verify') {
        errors.push('Não desative a verificação TLS por variáveis globais do processo.');
    }
    for (const key of ['AUTH_SECRET', 'CRON_SECRET']) {
        if (
            Buffer.byteLength(value(key)) < 32 ||
            placeholder.test(value(key)) ||
            new Set(value(key)).size < 8
        ) {
            errors.push(
                `${key} deve ser um segredo aleatório com pelo menos 32 bytes, sem placeholder.`,
            );
        }
    }
    const encryption = value('ENCRYPTION_KEY');
    if (
        !/^[A-Za-z0-9+/]{43}=$/.test(encryption) ||
        Buffer.from(encryption, 'base64').length !== 32 ||
        Buffer.from(encryption, 'base64').toString('base64') !== encryption ||
        new Set(Buffer.from(encryption, 'base64')).size < 8
    ) {
        errors.push('ENCRYPTION_KEY deve conter 32 bytes aleatórios em base64 canônico.');
    }
    if (value('AUTH_SECRET') && [value('CRON_SECRET'), encryption].includes(value('AUTH_SECRET'))) {
        errors.push('Use segredos independentes para autenticação, rotinas e criptografia.');
    }
    const driver = value('STORAGE_DRIVER') || 'local';
    if (!['local', 'gcs'].includes(driver)) errors.push('STORAGE_DRIVER deve ser local ou gcs.');
    if (target === 'gcp' && driver !== 'gcs')
        errors.push('Cloud Run exige STORAGE_DRIVER=gcs; disco local é efêmero.');
    if (target === 'gcp-vm' && driver !== 'gcs')
        errors.push('HML na VM GCP exige STORAGE_DRIVER=gcs para preservar os uploads fora da VM.');
    if (driver === 'gcs' && !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(value('GCS_BUCKET')))
        errors.push('GCS_BUCKET é obrigatório e deve ter um nome válido.');
    if (driver === 'local')
        warnings.push('Uploads locais exigem volume persistente e backup separado.');
    const group = (keys: string[], message: string) => {
        const configured = keys.filter((key) => value(key));
        if (configured.length && configured.length !== keys.length) errors.push(message);
        return configured.length === keys.length;
    };
    const mailEnabled = group(
        ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'],
        'SMTP_HOST, SMTP_USER e SMTP_PASSWORD devem ser configurados juntos.',
    );
    if (!mailEnabled)
        warnings.push(
            'SMTP desativado: convites, confirmações e avisos por e-mail não serão entregues.',
        );
    if (value('SMTP_PORT') && !validInteger(value('SMTP_PORT'), 1, 65535))
        errors.push('SMTP_PORT deve ser uma porta válida.');
    if (
        value('SMTP_SECURE') &&
        !['true', 'false', '1', '0', 'yes', 'no'].includes(value('SMTP_SECURE').toLowerCase())
    )
        errors.push('SMTP_SECURE deve ser um booleano válido.');
    // Um domínio pré-preenchido não habilita OAuth. Credenciais parciais, sim, são erro.
    const oauth =
        value('GOOGLE_OAUTH_CLIENT_ID') || value('GOOGLE_OAUTH_CLIENT_SECRET')
            ? group(
                  [
                      'GOOGLE_OAUTH_CLIENT_ID',
                      'GOOGLE_OAUTH_CLIENT_SECRET',
                      'GOOGLE_OAUTH_ALLOWED_DOMAIN',
                  ],
                  'Google OAuth exige client ID, segredo e domínio autorizado juntos.',
              )
            : false;
    if (
        oauth &&
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(
            value('GOOGLE_OAUTH_ALLOWED_DOMAIN'),
        )
    )
        errors.push('GOOGLE_OAUTH_ALLOWED_DOMAIN deve conter somente o domínio da organização.');
    group(
        ['GOOGLE_CALENDAR_ID', 'GOOGLE_CALENDAR_API_KEY'],
        'Google Calendar exige ID do calendário e chave de API juntos.',
    );
    for (const [key, min, max] of [
        ['DB_POOL_MAX', 1, 50],
        ['DATABASE_CONNECTION_TIMEOUT_MS', 100, 30000],
        ['DATABASE_QUERY_TIMEOUT_MS', 100, 120000],
        ['TRUSTED_PROXY_HOPS', 0, 10],
    ] as const) {
        if (value(key) && !validInteger(value(key), min, max))
            errors.push(`${key} deve ser inteiro entre ${min} e ${max}.`);
    }
    if (!value('TRUSTED_PROXY_HOPS'))
        warnings.push(
            'IP do cliente não confiado: configure TRUSTED_PROXY_HOPS após validar o proxy; limites globais continuam ativos.',
        );
    if (cloud && value('SEED_ADMIN_PASSWORD'))
        errors.push('SEED_ADMIN_PASSWORD não deve ficar nos ambientes de nuvem.');
    return { errors, warnings };
}

export function assertRuntimeEnvironment(source: Record<string, string | undefined>): void {
    const report = inspectRuntimeEnvironment(source);
    if (report.errors.length) throw new Error(`Configuração inválida: ${report.errors.join(' ')}`);
}
