import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), limit: vi.fn(), messages: vi.fn(), cases: vi.fn(), scope: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ getCurrentUser: mocks.user, hasPermission: (user: { permissions: string[] } | null, permission: string) => Boolean(user?.permissions.includes(permission)) }));
vi.mock('@/lib/server/db', () => ({ prisma: { contactMessage: { count: mocks.messages }, atendimento: { count: mocks.cases } }, withActorDatabaseScope: mocks.scope }));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.limit }));
import { GET } from '@/app/api/admin/pendencias/stream/route';
beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: 'isolated-stream-actor', permissions: ['atendimentos'], name: 'Private Name', email: 'private@example.test' });
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.messages.mockResolvedValue(2); mocks.cases.mockResolvedValue(3);
    mocks.scope.mockImplementation((_user, work) => work());
});

describe('endpoint SSE autentica e limita pendências sem cache/PII', () => {
    it.each([[null, 401], [{ id: 'denied', permissions: [] }, 403]])('nega identidade/permissão ausente antes de consultar pendências', async (user, code) => {
        mocks.user.mockResolvedValue(user);
        const response = await GET(new Request('https://spm.test/api/admin/pendencias/stream'));
        expect(response.status).toBe(code);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(mocks.messages).not.toHaveBeenCalled();
    });
    it('recusa origem estrangeira sem usar a sessão', async () => {
        expect((await GET(new Request('https://spm.test/api/admin/pendencias/stream', { headers: { Origin: 'https://foreign.test' } }))).status).toBe(403);
        expect(mocks.user).not.toHaveBeenCalled();
    });
    it('envia somente contagens sob contexto RLS e nunca renova sessão idle', async () => {
        const abort = new AbortController();
        const response = await GET(new Request('https://spm.test/api/admin/pendencias/stream', { signal: abort.signal }));
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(response.headers.get('cache-control')).toContain('private, no-store');
        expect(response.headers.get('x-accel-buffering')).toBe('no');
        const reader = response.body!.getReader();
        const first = new TextDecoder().decode((await reader.read()).value);
        expect(first).toContain('data: {"messages":2,"cases":3}');
        expect(first).not.toMatch(/Private|example|actor/);
        expect(mocks.user.mock.calls.every(([options]) => options.touch === false)).toBe(true);
        expect(mocks.scope).toHaveBeenCalledOnce();
        abort.abort();
        expect((await reader.read()).done).toBe(true);
    });
    it('limite esgotado retorna Retry-After sem abrir stream ou ler dados', async () => {
        mocks.limit.mockResolvedValue({ allowed: false });
        const response = await GET(new Request('https://spm.test/api/admin/pendencias/stream'));
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('10');
        expect(mocks.messages).not.toHaveBeenCalled();
    });
    it('falha do limitador fica fechada e não imprime credenciais/provider error', async () => {
        mocks.limit.mockRejectedValue(new Error('postgresql://secret@private/db'));
        const response = await GET(new Request('https://spm.test/api/admin/pendencias/stream'));
        expect(response.status).toBe(503);
        expect(await response.text()).toBe('');
        expect(mocks.messages).not.toHaveBeenCalled();
    });
});
