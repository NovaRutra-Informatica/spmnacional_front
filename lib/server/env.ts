import 'server-only';

/**
 * Acesso tipado às variáveis de ambiente.
 *
 * Nada aqui lança erro na importação: o build precisa rodar sem banco e sem
 * credenciais. O que exige configuração valida no ponto de uso e degrada de
 * forma explícita (ex.: sem SMTP, a mensagem é gravada mas não notificada).
 */

function str(name: string, fallback = ''): string {
    return process.env[name]?.trim() || fallback;
}

function bool(name: string, fallback = false): boolean {
    const value = process.env[name]?.trim().toLowerCase();
    if (value === undefined || value === '') return fallback;
    return value === 'true' || value === '1' || value === 'yes';
}

function int(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
    appUrl: str('APP_URL', 'http://localhost:3000'),
    databaseUrl: str('DATABASE_URL'),

    authSecret: str('AUTH_SECRET'),
    encryptionKey: str('ENCRYPTION_KEY'),

    seed: {
        adminName: str('SEED_ADMIN_NAME', 'Administrador do SPM'),
        adminEmail: str('SEED_ADMIN_EMAIL', 'admin@spmnacional.org.br'),
        adminPassword: str('SEED_ADMIN_PASSWORD', 'soufoda'),
    },

    mail: {
        host: str('SMTP_HOST'),
        port: int('SMTP_PORT', 587),
        secure: bool('SMTP_SECURE', false),
        user: str('SMTP_USER'),
        password: str('SMTP_PASSWORD'),
        from: str('MAIL_FROM', 'SPM Nacional <contato@spmnacional.org.br>'),
        notifyTo: str('MAIL_NOTIFY_TO', 'contato@spmnacional.org.br'),
    },

    google: {
        clientId: str('GOOGLE_OAUTH_CLIENT_ID'),
        clientSecret: str('GOOGLE_OAUTH_CLIENT_SECRET'),
        allowedDomain: str('GOOGLE_OAUTH_ALLOWED_DOMAIN'),
        calendarId: str('GOOGLE_CALENDAR_ID'),
        calendarApiKey: str('GOOGLE_CALENDAR_API_KEY'),
    },

    storage: {
        driver: str('STORAGE_DRIVER', 'local') as 'local' | 'gcs',
        localDir: str('STORAGE_LOCAL_DIR', './storage/uploads'),
        gcsBucket: str('GCS_BUCKET'),
        gcsPublicBaseUrl: str('GCS_PUBLIC_BASE_URL'),
    },

    cronSecret: str('CRON_SECRET'),
} as const;

/** O login com Google só aparece quando o OAuth está configurado. */
export function isGoogleOAuthEnabled(): boolean {
    return Boolean(env.google.clientId && env.google.clientSecret);
}

/** A sincronização da agenda só roda com calendário e chave configurados. */
export function isGoogleCalendarEnabled(): boolean {
    return Boolean(env.google.calendarId && env.google.calendarApiKey);
}

/** Sem SMTP, o sistema grava tudo mas não envia e-mail. */
export function isMailEnabled(): boolean {
    return Boolean(env.mail.host && env.mail.user && env.mail.password);
}
