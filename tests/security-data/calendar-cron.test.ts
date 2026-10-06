import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sync: vi.fn(),
    audit: vi.fn(),
    secret: 'synthetic-cron-secret-for-unit-tests-only',
}));
vi.mock('@/lib/server/env', () => ({ env: { cronSecret: mocks.secret } }));
vi.mock('@/lib/server/google-calendar', () => ({ sincronizarAgenda: mocks.sync }));
vi.mock('@/lib/server/audit', () => ({ recordAudit: mocks.audit }));
import * as route from '@/app/api/cron/agenda/route';

describe('calendar scheduled endpoint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('does not expose a GET mutation handler', () => {
        expect(route).not.toHaveProperty('GET');
    });
    it('refuses unauthenticated calls without synchronizing', async () => {
        const response = await route.POST(
            new Request('https://spm.test/api/cron/agenda', { method: 'POST' }),
        );
        expect(response.status).toBe(401);
        expect(mocks.sync).not.toHaveBeenCalled();
    });
    it('returns retryable 503 when the provider failed', async () => {
        mocks.sync.mockResolvedValue({
            ok: false,
            partial: false,
            criados: 0,
            atualizados: 0,
            removidos: 0,
        });
        const response = await route.POST(
            new Request('https://spm.test/api/cron/agenda', {
                method: 'POST',
                headers: { authorization: `Bearer ${mocks.secret}` },
            }),
        );
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('60');
        expect(mocks.audit).not.toHaveBeenCalled();
    });
    it('reports success only for a completed sync operation', async () => {
        mocks.sync.mockResolvedValue({
            ok: true,
            partial: false,
            criados: 1,
            atualizados: 0,
            removidos: 0,
        });
        const response = await route.POST(
            new Request('https://spm.test/api/cron/agenda', {
                method: 'POST',
                headers: { authorization: `Bearer ${mocks.secret}` },
            }),
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ok: true, criados: 1 });
        expect(mocks.audit).toHaveBeenCalledOnce();
    });
});
