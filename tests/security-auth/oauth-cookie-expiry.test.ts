import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
    jar: null as NextResponse['cookies'] | null,
    fetch: vi.fn(),
    verify: vi.fn(),
    login: vi.fn(),
    audit: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: async () => mocks.jar }));
vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(), jwtVerify: mocks.verify }));
vi.mock('@/lib/server/auth', () => ({ loginWithGoogleProfile: mocks.login }));
vi.mock('@/lib/server/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('@/lib/server/oauth-rate-limit', () => ({
    googleOAuthRateLimitResponse: async () => null,
}));
vi.mock('@/lib/server/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/server/env', () => ({
    env: {
        appUrl: 'https://cookie-fixture.example',
        google: {
            clientId: 'fixture-client',
            clientSecret: 'fixture-secret',
            allowedDomain: 'cookie-fixture.example',
        },
    },
    isGoogleOAuthEnabled: () => true,
}));

const state = 's'.repeat(32);
const nonce = 'n'.repeat(32);
beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(Response.json({ id_token: 'synthetic-jose-fixture' }));
    mocks.verify.mockResolvedValue({
        payload: {
            sub: 'fixture-user',
            email: 'user@cookie-fixture.example',
            email_verified: true,
            hd: 'cookie-fixture.example',
            nonce,
            azp: 'fixture-client',
        },
    });
    mocks.login.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('expiração OAuth com ResponseCookies real do Next', () => {
    it.each(['production', 'development'])(
        'consome os três cookies com expiração, caminho e proteção corretos em %s',
        async (nodeEnv) => {
            vi.stubEnv('NODE_ENV', nodeEnv);
            vi.resetModules();
            const route = await import('@/app/api/auth/google/callback/route');
            const response = new NextResponse();
            const prefix = nodeEnv === 'production' ? '__Host-' : '';
            mocks.jar = response.cookies;
            for (const [name, value] of [
                ['g_state', state],
                ['g_nonce', nonce],
                ['g_verifier', 'v'.repeat(64)],
            ]) {
                mocks.jar.set(prefix + name, value, {
                    path: '/',
                    secure: nodeEnv === 'production',
                    httpOnly: true,
                    sameSite: 'lax',
                    maxAge: 600,
                });
            }
            await route.GET(
                new NextRequest(
                    `https://cookie-fixture.example/api/auth/google/callback?code=fixture-code&state=${state}`,
                ),
            );
            const cookies = response.headers.getSetCookie();
            expect(cookies).toHaveLength(3);
            for (const header of cookies) {
                expect(header).toMatch(/^(__Host-)?g_(state|nonce|verifier)=;/);
                expect(header).toContain('Path=/');
                expect(header).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
                expect(header).toContain('Max-Age=0');
                expect(header).toContain('HttpOnly');
                expect(header).toContain('SameSite=lax');
                expect(header).not.toMatch(/Domain=|fixture-code|synthetic-jose|ssss|vvvv|nnnn/);
                expect(header.includes('; Secure')).toBe(nodeEnv === 'production');
            }
            expect(mocks.login).toHaveBeenCalledOnce();
        },
    );

    it('cancelamento com state legítimo também expira cookies host-only; state falso não altera o fluxo', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.resetModules();
        const route = await import('@/app/api/auth/google/callback/route');
        const response = new NextResponse();
        mocks.jar = response.cookies;
        for (const [name, value] of [
            ['g_state', state],
            ['g_nonce', nonce],
            ['g_verifier', 'v'.repeat(64)],
        ]) {
            mocks.jar.set('__Host-' + name, value, {
                secure: true,
                path: '/',
                httpOnly: true,
                maxAge: 600,
            });
        }
        const before = response.headers.getSetCookie();
        await route.GET(
            new NextRequest(
                'https://cookie-fixture.example/api/auth/google/callback?state=forged&error=access_denied',
            ),
        );
        expect(response.headers.getSetCookie()).toEqual(before);
        await route.GET(
            new NextRequest(
                `https://cookie-fixture.example/api/auth/google/callback?state=${state}&error=access_denied`,
            ),
        );
        expect(response.headers.getSetCookie()).toHaveLength(3);
        for (const header of response.headers.getSetCookie()) {
            expect(header).toContain('; Secure');
            expect(header).toContain('Max-Age=0');
            expect(header).not.toMatch(/ssss|vvvv|nnnn/);
        }
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.login).not.toHaveBeenCalled();
    });
});
