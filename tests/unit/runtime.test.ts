import { describe, expect, it } from 'vitest';
import { assertRuntimeEnvironment, inspectRuntimeEnvironment } from '../../lib/config/runtime';

const valid = {
    APP_URL: 'https://spm.example.org',
    DATABASE_URL: 'postgresql://spm:strong-password@db/spm?sslmode=verify-full',
    AUTH_SECRET: 'authentication-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    CRON_SECRET: 'scheduled-secret-9876543210-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ENCRYPTION_KEY: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    DEPLOYMENT_TARGET: 'gcp',
    STORAGE_DRIVER: 'gcs',
    GCS_BUCKET: 'spm-uploads-test',
    GOOGLE_OAUTH_CLIENT_ID: 'unit-client.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'unit-client-secret',
    GOOGLE_OAUTH_ALLOWED_DOMAIN: 'example.org',
    GOOGLE_WORKSPACE_MFA_ENFORCED: 'true',
};
describe('preflight sem expor segredos', () => {
    it('rejects public credential variables and incomplete Analytics', () => {
        const report = inspectRuntimeEnvironment({ ...valid, NEXT_PUBLIC_DATABASE_URL: 'private-value', ANALYTICS_ENABLED: 'true' });
        expect(report.errors.join(' ')).toContain('Variável pública não autorizada');
        expect(report.errors.join(' ')).toContain('Analytics inválida');
        expect(report.errors.join(' ')).not.toContain('private-value');
        expect(inspectRuntimeEnvironment({ ...valid, ANALYTICS_ENABLED: 'true', GA_MEASUREMENT_ID: 'G-TEST123456', GA_ENHANCED_MEASUREMENT_DISABLED: 'true' }).errors).toEqual([]);
    });
    it('aceita configuração GCP coerente e avisa integrações desligadas', () => {
        expect(inspectRuntimeEnvironment(valid).errors).toEqual([]);
        expect(inspectRuntimeEnvironment(valid).warnings.join(' ')).toContain('SMTP');
        expect(() => assertRuntimeEnvironment(valid)).not.toThrow();
    });
    it.each([
        'https://user:pass@example.org',
        'http://example.org',
        'https://example.org/path',
        'https://example.org?token=secret',
        'javascript:alert(1)',
    ])('recusa origem %s', (APP_URL) => {
        expect(inspectRuntimeEnvironment({ ...valid, APP_URL }).errors.join()).toContain('APP_URL');
    });
    it('aceita Docker local HTTP mas não nuvem HTTP', () => {
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                APP_URL: 'http://localhost:3000',
                DEPLOYMENT_TARGET: 'local',
                STORAGE_DRIVER: 'local',
            }).errors,
        ).toEqual([]);
        expect(
            inspectRuntimeEnvironment({ ...valid, APP_URL: 'http://localhost:3000' }).errors.length,
        ).toBeGreaterThan(0);
    });
    it.each([
        { STORAGE_DRIVER: 'local' },
        { STORAGE_DRIVER: 'invalid' },
        { GCS_BUCKET: '' },
        { AUTH_SECRET: 'x'.repeat(64) },
        { CRON_SECRET: 'dev-cron-secret' },
        { ENCRYPTION_KEY: 'a'.repeat(44) },
        { AUTH_SECRET: valid.CRON_SECRET },
        { DATABASE_URL: 'postgresql://spm:SUA_SENHA@db/spm' },
        { DATABASE_URL: 'postgresql://spm:pass@db/spm?sslmode=no-verify' },
        { DATABASE_URL: 'postgresql://spm:pass@db/spm?ssl=no-verify' },
        { DATABASE_URL: 'postgresql://spm:pass@db/spm?sslmode=disable' },
        { PGSSLMODE: 'no-verify' },
        { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
        { NEXT_PUBLIC_SITE_URL: 'https://different.example.org' },
        { DEPLOYMENT_TARGET: 'invalid' },
        { SMTP_HOST: 'smtp.example.org' },
        { SMTP_PORT: '587junk' },
        { SMTP_SECURE: 'perhaps' },
        { GOOGLE_OAUTH_CLIENT_ID: '' },
        { GOOGLE_WORKSPACE_MFA_ENFORCED: 'false' },
        { TRANSLATION_ENABLED: 'true', GOOGLE_CLOUD_PROJECT: '' },
        { GOOGLE_CALENDAR_ID: 'calendar' },
        { DB_POOL_MAX: '1000' },
        { DATABASE_QUERY_TIMEOUT_MS: '-1' },
        { TRUSTED_PROXY_HOPS: '1x' },
        { SEED_ADMIN_PASSWORD: 'should-not-be-here' },
    ])('recusa configuração incompleta ou insegura %#', (invalid) => {
        expect(inspectRuntimeEnvironment({ ...valid, ...invalid }).errors.length).toBeGreaterThan(
            0,
        );
    });
    it('erros não contêm os valores informados', () => {
        const report = inspectRuntimeEnvironment({
            APP_URL: 'private-token-value',
            AUTH_SECRET: 'sensitive-value',
        });
        expect(JSON.stringify(report)).not.toMatch(/private-token-value|sensitive-value/);
        expect(() => assertRuntimeEnvironment({})).toThrow('Configuração inválida');
    });
    it('aceita socket Cloud SQL protegido pelo conector', () => {
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                DATABASE_URL:
                    'postgresql://spm:pass@localhost/spm?host=/cloudsql/project-id:southamerica-east1:spm-db',
            }).errors,
        ).toEqual([]);
    });
    it('aceita HML na VM com PostgreSQL pelo socket privado e uploads GCS', () => {
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                DEPLOYMENT_TARGET: 'gcp-vm',
                DATABASE_URL:
                    'postgresql://spm:pass@localhost/spm?host=/var/run/postgresql&schema=public',
            }).errors,
        ).toEqual([]);
    });
    it.each([
        { APP_URL: 'http://localhost:3000' },
        { STORAGE_DRIVER: 'local' },
        { GCS_BUCKET: '' },
        { GOOGLE_OAUTH_CLIENT_ID: '' },
        { GOOGLE_OAUTH_CLIENT_SECRET: '' },
        { GOOGLE_WORKSPACE_MFA_ENFORCED: 'false' },
        { SEED_ADMIN_PASSWORD: 'must-never-be-present' },
        { LOCAL_TEST_AUTH_ENABLED: 'true', LOCAL_TEST_AUTH_USER_ID: 'local-admin' },
        { DATABASE_URL: 'postgresql://spm:pass@localhost/spm' },
        { DATABASE_URL: 'postgresql://spm:pass@db/spm?sslmode=disable' },
        { DATABASE_URL: 'postgresql://spm:pass@db/spm?sslmode=require' },
    ])('recusa HML na VM com configuração insegura %#', (invalid) => {
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                DEPLOYMENT_TARGET: 'gcp-vm',
                DATABASE_URL: 'postgresql://spm:pass@localhost/spm?host=/var/run/postgresql',
                ...invalid,
            }).errors.length,
        ).toBeGreaterThan(0);
    });
    it.each(['gcp', 'gcp-vm'])('aceita TCP somente com verify-full em %s', (target) => {
        expect(inspectRuntimeEnvironment({ ...valid, DEPLOYMENT_TARGET: target }).errors).toEqual(
            [],
        );
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                DEPLOYMENT_TARGET: target,
                DATABASE_URL: 'postgresql://spm:pass@db/spm',
            }).errors.join(' '),
        ).toContain('sslmode=verify-full');
    });
    it.each([
        '/tmp/postgresql',
        '/var/run/postgresql/',
        '/var/run/postgresql-other',
        '/var/run/postgresql/../other',
    ])('recusa socket arbitrário %s mesmo com verify-full', (host) => {
        for (const target of ['gcp', 'gcp-vm']) {
            expect(
                inspectRuntimeEnvironment({
                    ...valid,
                    DEPLOYMENT_TARGET: target,
                    DATABASE_URL: `postgresql://spm:pass@localhost/spm?host=${host}&sslmode=verify-full`,
                }).errors.join(' '),
            ).toContain('socket PostgreSQL não autorizado');
        }
    });
    it('recusa socket arbitrário no hostname codificado', () => {
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                DEPLOYMENT_TARGET: 'gcp-vm',
                DATABASE_URL: 'postgresql://spm:pass@%2Ftmp%2Fpostgresql/spm?sslmode=verify-full',
            }).errors.join(' '),
        ).toContain('socket PostgreSQL não autorizado');
    });
    it.each([
        { DEPLOYMENT_TARGET: 'gcp' },
        { K_SERVICE: 'cloud-run-service' },
        { K_REVISION: 'cloud-run-revision' },
        { DATABASE_URL: 'postgresql://spm:pass@remote/spm?host=/var/run/postgresql' },
    ])('socket privado da VM não flexibiliza Cloud Run nem outro host %#', (override) => {
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                DEPLOYMENT_TARGET: 'gcp-vm',
                DATABASE_URL: 'postgresql://spm:pass@localhost/spm?host=/var/run/postgresql',
                ...override,
            }).errors.join(' '),
        ).toContain('socket PostgreSQL não autorizado');
    });
    it.each([
        'host=/var/run/postgresql&host=db',
        'host=/var/run/postgresql&host=/tmp/postgresql',
        'sslmode=verify-full&sslmode=disable',
        'sslmode=verify-full&ssl=true&ssl=no-verify',
    ])('recusa parâmetros ambíguos de conexão: %s', (query) => {
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                DEPLOYMENT_TARGET: 'gcp-vm',
                DATABASE_URL: `postgresql://spm:pass@localhost/spm?${query}`,
            }).errors.join(' '),
        ).toContain('não deve repetir');
    });
    it('domínio sem credenciais mantém somente o ambiente local sem acesso ao painel', () => {
        expect(
            inspectRuntimeEnvironment({
                ...valid,
                DEPLOYMENT_TARGET: 'local',
                GOOGLE_OAUTH_CLIENT_ID: '',
                GOOGLE_OAUTH_CLIENT_SECRET: '',
                GOOGLE_OAUTH_ALLOWED_DOMAIN: 'spmnacional.org.br',
            }).errors,
        ).toEqual([]);
    });
});
