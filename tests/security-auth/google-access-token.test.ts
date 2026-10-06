import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), readFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '');
    vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});
describe('token de serviço Google', () => {
    it('deduplica refresh concorrente e reutiliza o token até expirar', async () => {
        mocks.fetch.mockImplementation(async () =>
            Response.json(
                { access_token: 'access-token', expires_in: 3600 },
                { headers: { 'Metadata-Flavor': 'Google' } },
            ),
        );
        const { getGoogleAccessToken } = await import('@/lib/server/google-auth');
        const tokens = await Promise.all([
            getGoogleAccessToken(['scope-a']),
            getGoogleAccessToken(['scope-a']),
        ]);
        expect(tokens).toEqual(['access-token', 'access-token']);
        expect(await getGoogleAccessToken(['scope-a'])).toBe('access-token');
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
        expect(mocks.fetch).toHaveBeenCalledWith(
            expect.any(URL),
            expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
        );
    });
    it('não aceita resposta sem marca do servidor de metadados', async () => {
        mocks.fetch.mockResolvedValue(Response.json({ access_token: 'forged', expires_in: 3600 }));
        const { getGoogleAccessToken } = await import('@/lib/server/google-auth');
        expect(await getGoogleAccessToken(['scope-a'])).toBeNull();
    });
    it.each([true, false])(
        'limita bytes do token metadata (Content-Length=%s)',
        async (declared) => {
            mocks.fetch.mockImplementation(
                async () =>
                    new Response(
                        JSON.stringify({ access_token: 'a'.repeat(65_536), expires_in: 3600 }),
                        {
                            headers: {
                                'Metadata-Flavor': 'Google',
                                ...(declared ? { 'content-length': '65600' } : {}),
                            },
                        },
                    ),
            );
            const { getGoogleAccessToken } = await import('@/lib/server/google-auth');
            expect(await getGoogleAccessToken(['scope-a'])).toBeNull();
            expect(await getGoogleAccessToken(['scope-a'])).toBeNull();
            expect(mocks.fetch).toHaveBeenCalledTimes(2);
            expect(mocks.readFile).not.toHaveBeenCalled();
        },
    );
    it('não aceita duração inválida nem envia credencial a token_uri arbitrário', async () => {
        mocks.fetch.mockResolvedValue(
            Response.json(
                { access_token: 'token', expires_in: -1 },
                { headers: { 'Metadata-Flavor': 'Google' } },
            ),
        );
        vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', 'mock-only-key.json');
        mocks.readFile.mockResolvedValue(
            JSON.stringify({
                client_email: 'service@example.test',
                private_key: 'dummy',
                token_uri: 'https://evil.example/token',
            }),
        );
        const { getGoogleAccessToken } = await import('@/lib/server/google-auth');
        expect(await getGoogleAccessToken(['scope-a'])).toBeNull();
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });
});
