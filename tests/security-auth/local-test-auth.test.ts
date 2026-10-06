import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalTestRequest, readLocalTestAuth } from '@/lib/config/local-test-auth';
import { inspectWorkspaceAuthEnvironment } from '@/lib/config/workspace-auth';

const source = () => ({
    LOCAL_TEST_AUTH_ENABLED: 'true',
    LOCAL_TEST_AUTH_USER_ID: 'local-user-1',
    DEPLOYMENT_TARGET: 'local',
    APP_URL: 'http://localhost:3147',
});

describe('política explícita de acesso local temporário', () => {
    it('padrão desligado, sem fallback automático', () => {
        expect(readLocalTestAuth({})).toEqual({ enabled: false, userId: null });
    });
    it.each(['http://localhost:3147', 'https://127.0.0.1:3147', 'http://[::1]:3147/'])(
        'aceita apenas origem canônica loopback: %s',
        (appUrl) => {
            expect(readLocalTestAuth({ ...source(), APP_URL: appUrl })).toEqual({
                enabled: true,
                userId: 'local-user-1',
            });
        },
    );
    it.each([
        { LOCAL_TEST_AUTH_ENABLED: 'false' },
        { LOCAL_TEST_AUTH_ENABLED: ' true ' },
        { LOCAL_TEST_AUTH_ENABLED: '1' },
        { DEPLOYMENT_TARGET: '' },
        { DEPLOYMENT_TARGET: 'gcp' },
        { DEPLOYMENT_TARGET: 'gcp-vm' },
        { K_SERVICE: 'cloud-run-service' },
        { K_REVISION: 'cloud-run-revision' },
        { GOOGLE_OAUTH_CLIENT_ID: 'configured-client' },
        { GOOGLE_OAUTH_CLIENT_SECRET: 'configured-secret' },
        { LOCAL_TEST_AUTH_USER_ID: '' },
        { LOCAL_TEST_AUTH_USER_ID: '../other-user' },
        { LOCAL_TEST_AUTH_USER_ID: 'a'.repeat(129) },
        { APP_URL: 'https://example.org' },
        { APP_URL: 'https://localhost.evil.test' },
        { APP_URL: 'http://user:pass@localhost:3147' },
        { APP_URL: 'http://localhost:3147/path' },
        { APP_URL: 'http://localhost:3147/?query=1' },
        { APP_URL: 'http://localhost:3147/#hash' },
        { APP_URL: 'file://localhost/' },
        { APP_URL: 'http://127.1:3147' },
    ])('falha fechado quando inválido: %j', (override) => {
        expect(readLocalTestAuth({ ...source(), ...override })).toEqual({
            enabled: false,
            userId: null,
        });
    });
    it('Google Cloud Project para tradução não converte o modo em autenticação cloud', () => {
        expect(
            readLocalTestAuth({ ...source(), GOOGLE_CLOUD_PROJECT: 'translation-project' }).enabled,
        ).toBe(true);
    });
    it.each([
        {},
        { host: 'evil.test', 'x-forwarded-host': 'localhost:3147' },
        { host: 'localhost:3148' },
        { host: '127.0.0.1:3147' },
        { host: 'localhost:3147', 'x-forwarded-host': 'public-tunnel.test' },
        { host: 'localhost:3147', 'sec-fetch-site': 'cross-site' },
    ])('recusa host/canal não canônico: %j', (headerValues) => {
        expect(
            isLocalTestRequest(new Headers(headerValues as Record<string, string>), source()),
        ).toBe(false);
    });
    it('aceita o Host canônico sem confiar em um proxy diferente', () => {
        expect(isLocalTestRequest(new Headers({ host: 'localhost:3147' }), source())).toBe(true);
        expect(
            isLocalTestRequest(
                new Headers({ host: 'localhost:3147', 'x-forwarded-host': 'localhost:3147' }),
                source(),
            ),
        ).toBe(true);
    });
    it('preflight avisa explicitamente modo sem Google/2FA e rejeita cloud/incompleto', () => {
        const local = inspectWorkspaceAuthEnvironment(source());
        expect(local.errors).toEqual([]);
        expect(local.warnings.join(' ')).toContain('ACESSO LOCAL DE TESTE ATIVO');
        expect(local.warnings.join(' ')).not.toContain('painel está indisponível');
        for (const override of [
            { DEPLOYMENT_TARGET: 'gcp' },
            { DEPLOYMENT_TARGET: 'gcp-vm' },
            { K_REVISION: 'rev-1' },
            { LOCAL_TEST_AUTH_USER_ID: '' },
            { GOOGLE_OAUTH_CLIENT_ID: 'id' },
        ]) {
            expect(
                inspectWorkspaceAuthEnvironment({ ...source(), ...override }).errors.join(' '),
            ).toContain('Acesso local de teste exige');
        }
    });
});

const mocks = vi.hoisted(() => ({
    headerValues: new Map<string, string>(),
    store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    attempts: vi.fn(),
    audit: vi.fn(),
    rate: vi.fn(),
}));
vi.mock('next/headers', () => ({
    headers: async () => new Headers(Object.fromEntries(mocks.headerValues)),
    cookies: async () => mocks.store,
}));
vi.mock('@/lib/server/env', () => ({
    env: { appUrl: 'http://localhost:3147', google: { allowedDomain: '' } },
}));
vi.mock('@/lib/server/db', () => ({
    prisma: { user: mocks.user, session: mocks.session, loginAttempt: { create: mocks.attempts } },
}));
vi.mock('@/lib/server/crypto', () => ({
    generateToken: () => 'a'.repeat(43),
    hashToken: (token: string) => `hashed:${token}`,
}));
vi.mock('@/lib/server/audit', () => ({
    recordAudit: mocks.audit,
    requestMeta: async () => ({ ip: null, userAgent: 'local-test' }),
}));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.rate }));
import { getCurrentUser, getLocalTestAccount, loginWithLocalTestAccount } from '@/lib/server/auth';

function user() {
    return {
        id: 'local-user-1',
        email: 'admin',
        name: 'Admin legado local',
        initials: 'AD',
        status: 'ATIVO',
        googleSub: 'existing-google-sub',
        passwordHash: 'existing-password-hash',
        regionalId: null,
        regional: null,
        role: {
            id: 'role-1',
            key: 'admin',
            name: 'Administrador',
            permissions: [{ permissionKey: 'noticias' }],
        },
    };
}
function session() {
    return {
        id: 'local-session-1',
        userId: 'local-user-1',
        user: user(),
        authMethod: 'LOCAL_TEST',
        googleSub: null,
        workspaceDomain: null,
        createdAt: new Date(Date.now() - 1000),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 3_599_000),
        revokedAt: null,
    };
}
beforeEach(() => {
    vi.clearAllMocks();
    for (const [key, value] of Object.entries({
        ...source(),
        K_SERVICE: '',
        K_REVISION: '',
        GOOGLE_OAUTH_CLIENT_ID: '',
        GOOGLE_OAUTH_CLIENT_SECRET: '',
    }))
        vi.stubEnv(key, value);
    mocks.headerValues.clear();
    mocks.headerValues.set('host', 'localhost:3147');
    mocks.headerValues.set('origin', 'http://localhost:3147');
    mocks.headerValues.set('sec-fetch-site', 'same-origin');
    mocks.user.findUnique.mockResolvedValue(user());
    mocks.session.create.mockResolvedValue({});
    mocks.session.findUnique.mockResolvedValue(session());
    mocks.attempts.mockResolvedValue({});
    mocks.audit.mockResolvedValue(undefined);
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.store.get.mockReturnValue({ value: 'a'.repeat(43) });
});
afterEach(() => vi.unstubAllEnvs());

describe('login local sempre escolhe somente a conta configurada no servidor', () => {
    it('mostra somente nome/email da conta ativa configurada, inclusive login legado', async () => {
        expect(await getLocalTestAccount()).toEqual({ name: 'Admin legado local', email: 'admin' });
        expect(mocks.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'local-user-1' } }),
        );
    });
    it('emite sessão opaca de uma hora sem alterar senha, vínculo Google ou perfil', async () => {
        expect((await loginWithLocalTestAccount()).ok).toBe(true);
        expect(mocks.session.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                userId: 'local-user-1',
                tokenHash: `hashed:${'a'.repeat(43)}`,
                authMethod: 'LOCAL_TEST',
                googleSub: null,
                workspaceDomain: null,
            }),
        });
        const { createdAt, expiresAt } = mocks.session.create.mock.calls[0][0].data;
        expect(expiresAt.getTime() - createdAt.getTime()).toBe(3_600_000);
        expect(mocks.store.set).toHaveBeenCalledWith(
            expect.any(String),
            'a'.repeat(43),
            expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 }),
        );
        expect(mocks.user.create).not.toHaveBeenCalled();
        expect(mocks.user.update).not.toHaveBeenCalled();
        expect(mocks.user.updateMany).not.toHaveBeenCalled();
        expect(mocks.attempts).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ success: true, reason: 'LOCAL_TEST' }),
            }),
        );
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({ level: 'ALERTA', metadata: { reason: 'LOCAL_TEST' } }),
        );
    });
    it.each(['cross-origin', 'missing-origin'])(
        'nega %s antes da consulta/limite/sessão',
        async (reason) => {
            if (reason === 'cross-origin') mocks.headerValues.set('origin', 'https://evil.test');
            else mocks.headerValues.delete('origin');
            await expect(loginWithLocalTestAccount()).rejects.toThrow('origem');
            expect(mocks.user.findUnique).not.toHaveBeenCalled();
            expect(mocks.rate).not.toHaveBeenCalled();
            expect(mocks.session.create).not.toHaveBeenCalled();
        },
    );
    it.each(['INATIVO', 'PENDENTE', 'missing', 'wrong-id'])(
        'nega conta %s sem criar usuário ou sessão',
        async (reason) => {
            mocks.user.findUnique.mockResolvedValue(
                reason === 'missing'
                    ? null
                    : {
                          ...user(),
                          status: reason === 'wrong-id' ? 'ATIVO' : reason,
                          id: reason === 'wrong-id' ? 'another-user' : 'local-user-1',
                      },
            );
            expect(await getLocalTestAccount()).toBeNull();
            expect((await loginWithLocalTestAccount()).ok).toBe(false);
            expect(mocks.user.create).not.toHaveBeenCalled();
            expect(mocks.session.create).not.toHaveBeenCalled();
        },
    );
    it('respeita limite global local antes de buscar usuário', async () => {
        mocks.rate.mockResolvedValue({ allowed: false });
        expect((await loginWithLocalTestAccount()).ok).toBe(false);
        expect(mocks.user.findUnique).not.toHaveBeenCalled();
        expect(mocks.session.create).not.toHaveBeenCalled();
    });
    it.each(['flag-off', 'cloud', 'gcp-vm', 'google', 'host'])(
        'nega %s em consulta, login e sessão já emitida',
        async (reason) => {
            if (reason === 'flag-off') vi.stubEnv('LOCAL_TEST_AUTH_ENABLED', 'false');
            if (reason === 'cloud') vi.stubEnv('K_REVISION', 'cloud-revision');
            if (reason === 'gcp-vm') vi.stubEnv('DEPLOYMENT_TARGET', 'gcp-vm');
            if (reason === 'google') vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'configured-google');
            if (reason === 'host') mocks.headerValues.set('host', 'evil.test');
            expect(await getLocalTestAccount()).toBeNull();
            expect((await loginWithLocalTestAccount()).ok).toBe(false);
            expect(await getCurrentUser()).toBeNull();
            expect(mocks.session.create).not.toHaveBeenCalled();
        },
    );
    it('aceita sessão LOCAL_TEST válida mesmo sem domínio Workspace', async () => {
        expect((await getCurrentUser())?.id).toBe('local-user-1');
    });
    it.each([
        'legacy',
        'different-user',
        'inactive',
        'expired',
        'over-one-hour',
        'oversized-expiry',
        'future-created',
        'google-sub',
    ])('nega sessão %s', async (reason) => {
        const record = session();
        if (reason === 'legacy') record.authMethod = 'LEGACY';
        if (reason === 'different-user') record.userId = 'another-user';
        if (reason === 'inactive') record.user.status = 'INATIVO';
        if (reason === 'expired') record.expiresAt = new Date(Date.now() - 1);
        if (reason === 'over-one-hour') record.createdAt = new Date(Date.now() - 3_600_001);
        if (reason === 'oversized-expiry') record.expiresAt = new Date(Date.now() + 12 * 3_600_000);
        if (reason === 'future-created') record.createdAt = new Date(Date.now() + 60_000);
        if (reason === 'google-sub') Object.assign(record, { googleSub: 'google-sub' });
        mocks.session.findUnique.mockResolvedValue(record);
        expect(await getCurrentUser()).toBeNull();
    });
    it('trocar o usuário-alvo também invalida a sessão de teste antiga', async () => {
        vi.stubEnv('LOCAL_TEST_AUTH_USER_ID', 'another-user');
        expect(await getCurrentUser()).toBeNull();
    });
});
