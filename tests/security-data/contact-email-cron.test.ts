import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    process: vi.fn(),
    env: { cronSecret: 'synthetic-cron-secret-abcdefghijklmnopqrstuvwxyz' },
}));
vi.mock('@/lib/server/env', () => ({ env: mocks.env }));
vi.mock('@/lib/server/generic-email-outbox', () => ({
    processPendingNotificationEmails: mocks.process,
}));
import { POST, maxDuration } from '@/app/api/cron/notificacoes/route';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.cronSecret = 'synthetic-cron-secret-abcdefghijklmnopqrstuvwxyz';
    mocks.process.mockResolvedValue({
        sent: 0,
        failed: 0,
        skipped: 0,
        pending: 2,
        deadLetters: 0,
        smtpEnabled: false,
    });
});
const request = (headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/cron/notificacoes', { method: 'POST', headers });
describe('independent authenticated contact email cron', () => {
    it.each([{}, { authorization: 'Bearer wrong' }, { 'x-cron-secret': 'wrong' }] as Record<
        string,
        string
    >[])('never processes unauthenticated requests: %j', async (headers) => {
        const response = await POST(request(headers));
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mocks.process).not.toHaveBeenCalled();
    });
    it.each(['authorization', 'x-cron-secret'])(
        'accepts the operational credential in %s and keeps disabled SMTP pending',
        async (header) => {
            const response = await POST(
                request({
                    [header]:
                        header === 'authorization'
                            ? `Bearer ${mocks.env.cronSecret}`
                            : mocks.env.cronSecret,
                }),
            );
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                ok: true,
                pending: 2,
                smtpEnabled: false,
            });
            expect(mocks.process).toHaveBeenCalledOnce();
            expect(maxDuration).toBe(180);
        },
    );
    it('fails closed if the configured secret is short, even when the caller matches it', async () => {
        mocks.env.cronSecret = 'short';
        expect((await POST(request({ authorization: 'Bearer short' }))).status).toBe(401);
        expect(mocks.process).not.toHaveBeenCalled();
    });
    it('reports retries/dead letters through counts without record identities or provider errors', async () => {
        mocks.process.mockResolvedValue({
            sent: 0,
            failed: 1,
            skipped: 0,
            pending: 1,
            deadLetters: 1,
            smtpEnabled: true,
        });
        const response = await POST(request({ authorization: `Bearer ${mocks.env.cronSecret}` }));
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('60');
        expect(await response.json()).toMatchObject({ ok: false, failed: 1, deadLetters: 1 });
    });
    it('does not expose credentials or infrastructure exceptions', async () => {
        mocks.process.mockRejectedValue(
            new Error('private@example.test smtp-password DB-connection'),
        );
        const response = await POST(request({ authorization: `Bearer ${mocks.env.cronSecret}` }));
        expect(response.status).toBe(503);
        expect(await response.text()).not.toMatch(
            /private@example|smtp-password|DB-connection|synthetic-cron/,
        );
    });
});
