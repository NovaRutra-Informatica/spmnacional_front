import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    cookies: new Map<string, string>(),
    remove: vi.fn(),
    expire: vi.fn(),
    verify: vi.fn(),
    login: vi.fn(),
    fetch: vi.fn(),
    audit: vi.fn(),
    limit: vi.fn(),
}));
vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: (key: string) => ({ value: mocks.cookies.get(key) }),
        delete: mocks.remove,
        set: mocks.expire,
    }),
}));
vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(), jwtVerify: mocks.verify }));
vi.mock('@/lib/server/env', () => ({
    env: {
        appUrl: 'https://spm.example',
        google: { clientId: 'client-1', clientSecret: 'secret-1', allowedDomain: 'spm.example' },
    },
    isGoogleOAuthEnabled: () => true,
}));
vi.mock('@/lib/server/auth', () => ({ loginWithGoogleProfile: mocks.login }));
vi.mock('@/lib/server/audit', () => ({
    recordAudit: mocks.audit,
    requestMeta: async () => ({ ip: '203.0.113.1', userAgent: null }),
}));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.limit }));
vi.mock('@/lib/server/logger', () => ({ logError: vi.fn() }));
import { GET } from '@/app/api/auth/google/callback/route';

const state = 's'.repeat(32);
const nonce = 'n'.repeat(32);
function claims() {
    return {
        sub: 'google-1',
        email: 'equipe@spm.example',
        email_verified: true,
        nonce,
        hd: 'spm.example',
        azp: 'client-1',
    };
}
function request(query = `code=valid-code&state=${state}`) {
    return new NextRequest(`https://untrusted-host.example/api/auth/google/callback?${query}`);
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.clear();
    for (const prefix of ['', '__Host-']) {
        mocks.cookies.set(`${prefix}g_state`, state);
        mocks.cookies.set(`${prefix}g_nonce`, nonce);
        mocks.cookies.set(`${prefix}g_verifier`, 'v'.repeat(64));
    }
    mocks.fetch.mockResolvedValue(Response.json({ id_token: 'verified-by-jose' }));
    mocks.verify.mockResolvedValue({ payload: claims() });
    mocks.login.mockResolvedValue({ ok: true });
    mocks.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 900 });
    vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('OAuth Authorization Code + PKCE', () => {
    it('state inválido não apaga cookies, registra auditoria nem chama provedor', async () => {
        const response = await GET(request('error=access_denied&state=forged'));
        expect(response.headers.get('location')).toContain('https://spm.example/atendente');
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.expire).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.limit).not.toHaveBeenCalled();
    });
    it('limita callback antes de consumir cookies, chamar Google ou escrever auditoria', async () => {
        mocks.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
        const response = await GET(request());
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('120');
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.expire).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
        expect(mocks.login).not.toHaveBeenCalled();
    });
    it('consome cancelamento somente com state correspondente', async () => {
        await GET(request(`error=access_denied&state=${state}`));
        expect(mocks.expire).toHaveBeenCalledTimes(3);
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.login).not.toHaveBeenCalled();
    });
    it('usa timeout e sem redirecionamento na troca que contém o secret', async () => {
        const response = await GET(request());
        expect(mocks.fetch).toHaveBeenCalledWith(
            'https://oauth2.googleapis.com/token',
            expect.objectContaining({
                signal: expect.any(AbortSignal),
                redirect: 'error',
                cache: 'no-store',
            }),
        );
        expect(mocks.verify).toHaveBeenCalledWith(
            'verified-by-jose',
            undefined,
            expect.objectContaining({
                audience: 'client-1',
                algorithms: ['RS256'],
                requiredClaims: expect.arrayContaining(['exp', 'sub', 'nonce']),
            }),
        );
        expect(response.headers.get('location')).toBe('https://spm.example/admin');
        expect(mocks.login).toHaveBeenCalledWith(
            expect.objectContaining({ sub: 'google-1', hd: 'spm.example', emailVerified: true }),
        );
    });
    it.each([
        { nonce: 'wrong' },
        { email_verified: false },
        { email_verified: 'true' },
        { hd: 'other.example' },
        { hd: undefined },
        { email: 'equipe@gmail.com' },
        { email: 'equipe@sub.spm.example' },
        { email: 'equipe@spm.example.evil.test' },
        { azp: 'another-client' },
        { sub: '' },
        { email: '' },
    ])('recusa claims incompatíveis %j antes de abrir sessão', async (override) => {
        mocks.verify.mockResolvedValue({ payload: { ...claims(), ...override } });
        expect((await GET(request())).headers.get('location')).toContain('/atendente?erro=');
        expect(mocks.login).not.toHaveBeenCalled();
    });
    it('recusa assinatura inválida antes de processar perfil', async () => {
        mocks.verify.mockRejectedValue(new Error('invalid signature'));
        await GET(request());
        expect(mocks.login).not.toHaveBeenCalled();
    });
    it('devolve falha segura quando provedor ou banco indisponível', async () => {
        mocks.fetch.mockRejectedValueOnce(new Error('timeout'));
        expect((await GET(request())).headers.get('location')).toContain('/atendente?erro=');
        mocks.login.mockRejectedValueOnce(new Error('database detail'));
        expect((await GET(request())).headers.get('location')).not.toContain('database');
    });
    it.each([true, false])(
        'recusa JSON excessivo do provedor (Content-Length=%s)',
        async (declared) => {
            mocks.fetch.mockResolvedValue(
                new Response(JSON.stringify({ id_token: 'a'.repeat(65_536) }), {
                    headers: declared ? { 'content-length': '65555' } : {},
                }),
            );
            const response = await GET(request());
            expect(response.headers.get('location')).toContain('/atendente?erro=');
            expect(mocks.verify).not.toHaveBeenCalled();
            expect(mocks.login).not.toHaveBeenCalled();
        },
    );
});
