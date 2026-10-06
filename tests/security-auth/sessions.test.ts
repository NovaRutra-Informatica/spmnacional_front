import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    session: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    verifyPassword: vi.fn(),
    limit: vi.fn(),
    origin: vi.fn(),
}));
vi.mock('@/lib/server/env', () => ({ env: { google: { allowedDomain: 'spm.example' } } }));
vi.mock('next/headers', () => ({ cookies: async () => mocks.store }));
vi.mock('next/navigation', () => ({
    redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
    },
}));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        session: mocks.session,
        user: mocks.user,
        loginAttempt: { create: vi.fn().mockResolvedValue({}) },
    },
}));
vi.mock('@/lib/server/crypto', () => ({
    hashToken: (value: string) => `hash:${value}`,
    generateToken: () => 'n'.repeat(43),
    verifyPassword: mocks.verifyPassword,
}));
vi.mock('@/lib/server/audit', () => ({
    requestMeta: async () => ({ ip: null, userAgent: null }),
    recordAudit: vi.fn(),
}));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.limit }));
vi.mock('@/lib/server/request-origin', () => ({ assertTrustedMutationOrigin: mocks.origin }));

import {
    destroySession,
    getCurrentUser,
    hasPermission,
    loginWithGoogleProfile,
    loginWithPassword,
} from '@/lib/server/auth';

function userRecord() {
    return {
        id: 'user-1',
        name: 'Equipe',
        email: 'equipe@spm.example',
        initials: 'EQ',
        status: 'ATIVO',
        googleSub: 'google-1',
        mustChangePassword: false,
        regionalId: 'r-1',
        regional: { name: 'Regional' },
        passwordHash: 'stored',
        lockedUntil: null,
        failedLoginCount: 0,
        role: {
            id: 'role-1',
            key: 'editor',
            name: 'Editor',
            permissions: [{ permissionKey: 'noticias' }],
        },
    };
}
function activeSession() {
    return {
        id: 'session-1',
        userId: 'user-1',
        authMethod: 'GOOGLE_WORKSPACE',
        googleSub: 'google-1',
        workspaceDomain: 'spm.example',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        user: userRecord(),
    };
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.get.mockReturnValue({ value: 'a'.repeat(43) });
    mocks.session.findUnique.mockResolvedValue(activeSession());
    mocks.session.create.mockResolvedValue({});
    mocks.session.update.mockResolvedValue({});
    mocks.session.updateMany.mockResolvedValue({ count: 1 });
    mocks.user.update.mockResolvedValue({});
    mocks.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.user.findUnique.mockResolvedValue(userRecord());
    mocks.verifyPassword.mockResolvedValue(false);
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.origin.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('validação de sessão', () => {
    it.each([undefined, { value: 'forged' }])(
        'ignora cookie ausente ou malformado sem consultar banco',
        async (cookie) => {
            mocks.store.get.mockReturnValue(cookie);
            expect(await getCurrentUser()).toBeNull();
            expect(mocks.session.findUnique).not.toHaveBeenCalled();
        },
    );
    it('falha fechado com indisponibilidade do banco', async () => {
        mocks.session.findUnique.mockRejectedValue(new Error('unavailable'));
        expect(await getCurrentUser()).toBeNull();
    });
    it.each(['revoked', 'expired', 'idle', 'inactive'])('bloqueia sessão %s', async (reason) => {
        const session = activeSession();
        if (reason === 'revoked') Object.assign(session, { revokedAt: new Date() });
        if (reason === 'expired') session.expiresAt = new Date(Date.now() - 1);
        if (reason === 'idle') session.lastSeenAt = new Date(Date.now() - 30 * 60_000);
        if (reason === 'inactive') session.user.status = 'INATIVO';
        mocks.session.findUnique.mockResolvedValue(session);
        expect(await getCurrentUser()).toBeNull();
    });
    it('reconsulta permissões atuais e não divulga hashes', async () => {
        const user = await getCurrentUser();
        expect(user).not.toHaveProperty('passwordHash');
        expect(hasPermission(user, 'noticias')).toBe(true);
        expect(hasPermission(user, 'usuarios')).toBe(false);
    });
    it('background checks validate the session without renewing idle timestamps', async () => {
        const session = activeSession();
        session.lastSeenAt = new Date(Date.now() - 2 * 60_000);
        mocks.session.findUnique.mockResolvedValue(session);
        expect(await getCurrentUser({ touch: false })).not.toBeNull();
        expect(mocks.session.update).not.toHaveBeenCalled();
        expect(mocks.user.update).not.toHaveBeenCalled();
        expect(await getCurrentUser()).not.toBeNull();
        expect(mocks.session.update).toHaveBeenCalledOnce();
        expect(mocks.user.update).toHaveBeenCalledOnce();
    });
    it('background checks still reject and revoke an idle session', async () => {
        const session = activeSession();
        session.lastSeenAt = new Date(Date.now() - 30 * 60_000);
        mocks.session.findUnique.mockResolvedValue(session);
        expect(await getCurrentUser({ touch: false })).toBeNull();
        expect(mocks.session.update).toHaveBeenCalledWith({
            where: { id: session.id },
            data: { revokedAt: expect.any(Date) },
        });
        expect(mocks.user.update).not.toHaveBeenCalled();
    });
    it('grava somente hash no banco e cookie protegido', async () => {
        mocks.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(userRecord());
        await loginWithGoogleProfile(profile());
        expect(mocks.session.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ tokenHash: `hash:${'n'.repeat(43)}` }),
            }),
        );
        expect(mocks.store.set).toHaveBeenCalledWith(
            expect.any(String),
            'n'.repeat(43),
            expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 43200 }),
        );
    });
    it('só confirma logout depois da revogação persistente', async () => {
        mocks.session.updateMany.mockRejectedValue(new Error('unavailable'));
        await expect(destroySession()).rejects.toThrow();
        expect(mocks.store.delete).not.toHaveBeenCalled();
        expect(mocks.store.set).not.toHaveBeenCalled();
    });
    it.each(['production', 'development'])(
        'expira o cookie de logout com os mesmos atributos da emissão em %s',
        async (nodeEnv) => {
            vi.stubEnv('NODE_ENV', nodeEnv);
            vi.resetModules();
            const auth = await import('@/lib/server/auth');
            mocks.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(userRecord());
            await auth.loginWithGoogleProfile(profile());
            const issuedOptions = mocks.store.set.mock.calls[0][2];
            mocks.store.set.mockClear();

            await auth.destroySession();

            expect(mocks.session.updateMany).toHaveBeenCalledWith({
                where: { tokenHash: `hash:${'a'.repeat(43)}`, revokedAt: null },
                data: { revokedAt: expect.any(Date) },
            });
            expect(mocks.store.set).toHaveBeenCalledWith(
                nodeEnv === 'production' ? '__Host-spm_session' : 'spm_session',
                '',
                {
                    ...issuedOptions,
                    maxAge: 0,
                    expires: new Date(0),
                },
            );
            expect(mocks.store.set.mock.calls[0][2]).toMatchObject({
                httpOnly: true,
                sameSite: 'lax',
                secure: nodeEnv === 'production',
                path: '/',
            });
            expect(mocks.store.set.mock.calls[0][2]).not.toHaveProperty('domain');
            expect(mocks.store.delete).not.toHaveBeenCalled();
        },
    );
});

function profile() {
    return { sub: 'google-1', email: 'equipe@spm.example', hd: 'spm.example', emailVerified: true };
}

function singleAccountHml(email = 'equipe@spm.example') {
    vi.stubEnv('DEPLOYMENT_TARGET', 'gcp-vm');
    vi.stubEnv('K_SERVICE', '');
    vi.stubEnv('K_REVISION', '');
    vi.stubEnv('GOOGLE_WORKSPACE_MFA_ENFORCED', 'false');
    vi.stubEnv('GOOGLE_OAUTH_ALLOWED_EMAILS', email);
    vi.stubEnv('GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS', email);
}

describe('HML restrita à conta com 2FA individual confirmado', () => {
    it('recusa outra identidade Workspace antes do banco e da emissão de sessão', async () => {
        singleAccountHml();
        expect(
            (await loginWithGoogleProfile({ ...profile(), email: 'outro@spm.example' })).ok,
        ).toBe(false);
        expect(mocks.user.findUnique).not.toHaveBeenCalled();
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(mocks.session.create).not.toHaveBeenCalled();
    });
    it('permite login somente da conta declarada e confirmada', async () => {
        singleAccountHml();
        mocks.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(userRecord());
        expect((await loginWithGoogleProfile(profile())).ok).toBe(true);
        expect(mocks.session.create).toHaveBeenCalledOnce();
    });
    it('nega sessão existente de outra conta mesmo com vínculo Workspace válido', async () => {
        singleAccountHml();
        const session = activeSession();
        session.user.email = 'outro@spm.example';
        mocks.session.findUnique.mockResolvedValue(session);
        expect(await getCurrentUser()).toBeNull();
    });
    it('reavalia a allowlist e nega a sessão da conta removida do escopo', async () => {
        singleAccountHml();
        expect((await getCurrentUser())?.email).toBe('equipe@spm.example');
        singleAccountHml('outra@spm.example');
        expect(await getCurrentUser()).toBeNull();
    });
    it.each(['GOOGLE_OAUTH_ALLOWED_EMAILS', 'GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS'])(
        'retirada de %s fecha login e sessões',
        async (key) => {
            singleAccountHml();
            vi.stubEnv(key, '');
            expect((await loginWithGoogleProfile(profile())).ok).toBe(false);
            expect(await getCurrentUser()).toBeNull();
            expect(mocks.session.create).not.toHaveBeenCalled();
        },
    );
});
describe('login exclusivo Google Workspace', () => {
    it('senha nunca autentica mesmo que seja válida e a conta exista', async () => {
        mocks.verifyPassword.mockResolvedValue(true);
        expect((await loginWithPassword('equipe@spm.example', 'senha válida')).ok).toBe(false);
        expect(mocks.user.findUnique).not.toHaveBeenCalled();
        expect(mocks.verifyPassword).not.toHaveBeenCalled();
        expect(mocks.session.create).not.toHaveBeenCalled();
    });
    it('não consulta conta quando o limitador recusa', async () => {
        mocks.limit.mockResolvedValue({ allowed: false });
        expect((await loginWithGoogleProfile(profile())).ok).toBe(false);
        expect(mocks.user.findUnique).not.toHaveBeenCalled();
    });
    it.each([
        { hd: undefined },
        { hd: 'other.example' },
        { hd: 'sub.spm.example' },
        { emailVerified: false },
        { email: 'equipe@gmail.com' },
        { email: 'equipe@spm.example.evil.test' },
        { email: 'equipe@other.example' },
        { sub: '' },
        { sub: 'bad subject' },
    ])('nega identidade fora da política antes do banco: %j', async (override) => {
        expect((await loginWithGoogleProfile({ ...profile(), ...override })).ok).toBe(false);
        expect(mocks.user.findUnique).not.toHaveBeenCalled();
        expect(mocks.session.create).not.toHaveBeenCalled();
    });
    it.each(['INATIVO', 'PENDENTE', 'missing', 'different-sub'])(
        'nega conta %s',
        async (status) => {
            const user =
                status === 'missing'
                    ? null
                    : {
                          ...userRecord(),
                          status: status === 'different-sub' ? 'ATIVO' : status,
                          googleSub: status === 'different-sub' ? 'other-sub' : null,
                      };
            mocks.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
            expect((await loginWithGoogleProfile(profile())).ok).toBe(false);
            expect(mocks.session.create).not.toHaveBeenCalled();
            expect(mocks.user.updateMany).not.toHaveBeenCalled();
        },
    );
    it('nega sub já vinculado a outro e-mail', async () => {
        mocks.user.findUnique.mockResolvedValueOnce({ id: 'other', email: 'outro@spm.example' });
        expect((await loginWithGoogleProfile(profile())).ok).toBe(false);
        expect(mocks.session.create).not.toHaveBeenCalled();
    });
    it('vincula Workspace autorizado com comparação atômica e persiste origem da sessão', async () => {
        mocks.user.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ ...userRecord(), googleSub: null });
        expect((await loginWithGoogleProfile(profile())).ok).toBe(true);
        expect(mocks.user.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'user-1',
                    email: 'equipe@spm.example',
                    status: 'ATIVO',
                    OR: [{ googleSub: null }, { googleSub: 'google-1' }],
                },
                data: expect.objectContaining({ passwordHash: null, googleSub: 'google-1' }),
            }),
        );
        expect(mocks.session.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    authMethod: 'GOOGLE_WORKSPACE',
                    googleSub: 'google-1',
                    workspaceDomain: 'spm.example',
                }),
            }),
        );
    });
    it('não abre sessão quando outra identidade ganhou a vinculação concorrente', async () => {
        mocks.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(userRecord());
        mocks.user.updateMany.mockResolvedValue({ count: 0 });
        expect((await loginWithGoogleProfile(profile())).ok).toBe(false);
        expect(mocks.session.create).not.toHaveBeenCalled();
    });
    it.each(['legacy', 'other-domain', 'null-sub', 'changed-user-sub', 'changed-email'])(
        'nega sessão antiga ou desvinculada: %s',
        async (reason) => {
            const session = activeSession();
            if (reason === 'legacy') session.authMethod = 'LEGACY';
            if (reason === 'other-domain') session.workspaceDomain = 'other.example';
            if (reason === 'null-sub') Object.assign(session, { googleSub: null });
            if (reason === 'changed-user-sub') session.user.googleSub = 'new-sub';
            if (reason === 'changed-email') session.user.email = 'person@other.example';
            mocks.session.findUnique.mockResolvedValue(session);
            expect(await getCurrentUser()).toBeNull();
        },
    );
});
