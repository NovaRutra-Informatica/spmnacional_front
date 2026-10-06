import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    meta: vi.fn(),
    limit: vi.fn(),
    setCookie: vi.fn(),
    log: vi.fn(),
}));
vi.mock('@/lib/server/audit', () => ({ requestMeta: mocks.meta }));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.limit }));
vi.mock('@/lib/server/logger', () => ({ logError: mocks.log }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.setCookie }) }));
vi.mock('@/lib/server/env', () => ({
    env: {
        appUrl: 'https://spm.example',
        google: { clientId: 'synthetic-client', allowedDomain: 'spm.example' },
    },
    isGoogleOAuthEnabled: () => true,
}));
vi.mock('@/lib/server/crypto', () => ({ generateToken: (size: number) => 'a'.repeat(size) }));
import { googleOAuthRateLimitResponse } from '@/lib/server/oauth-rate-limit';
import { GET } from '@/app/api/auth/google/route';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.meta.mockResolvedValue({ ip: '203.0.113.1' });
    mocks.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 900 });
});
afterEach(() => vi.unstubAllEnvs());

describe('OAuth admission before identity verification', () => {
    it('keeps the global limiter when no client IP can be trusted', async () => {
        mocks.meta.mockResolvedValue({ ip: null });
        expect(await googleOAuthRateLimitResponse('callback')).toBeNull();
        expect(mocks.limit).toHaveBeenCalledOnce();
        expect(mocks.limit).toHaveBeenCalledWith(
            expect.objectContaining({ scope: 'google-oauth-callback-global', identifier: 'all' }),
        );
    });
    it('refuses excess start requests without issuing state cookies', async () => {
        mocks.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 75 });
        const response = await GET();
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('75');
        expect(mocks.setCookie).not.toHaveBeenCalled();
    });
    it('fails closed and hides database details when the limiter is unavailable', async () => {
        mocks.limit.mockRejectedValue(new Error('database secret=never-disclose'));
        const response = await GET();
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('60');
        expect(await response.text()).not.toMatch(/database|secret|never-disclose/);
        expect(mocks.setCookie).not.toHaveBeenCalled();
    });
    it('retains host-only Secure/HttpOnly cookies and configured OAuth origin in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.resetModules();
        const route = await import('@/app/api/auth/google/route');
        const response = await route.GET();
        expect(response.status).toBe(307);
        const target = new URL(response.headers.get('location')!);
        expect(target.origin).toBe('https://accounts.google.com');
        expect(target.searchParams.get('redirect_uri')).toBe(
            'https://spm.example/api/auth/google/callback',
        );
        expect(mocks.setCookie).toHaveBeenCalledTimes(3);
        for (const [name, , options] of mocks.setCookie.mock.calls) {
            expect(name).toMatch(/^__Host-/);
            expect(options).toMatchObject({
                secure: true,
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
            });
            expect(options).not.toHaveProperty('domain');
        }
    });
});
