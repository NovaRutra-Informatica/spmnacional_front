import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    origin: vi.fn(),
    meta: vi.fn(),
    limit: vi.fn(),
    enabled: vi.fn(),
    scope: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    queue: vi.fn(),
    transaction: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/db', () => ({
    prisma: { newsletterSubscriber: { findUnique: mocks.find }, $transaction: mocks.transaction },
}));
vi.mock('@/lib/server/database-scope', () => ({ withPublicNewsletterDatabaseScope: mocks.scope }));
vi.mock('@/lib/server/audit', () => ({ requestMeta: mocks.meta, recordAudit: vi.fn() }));
vi.mock('@/lib/server/request-origin', async (original) => ({
    ...(await original<object>()),
    assertTrustedMutationOrigin: mocks.origin,
}));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.limit }));
vi.mock('@/lib/server/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/server/env', () => ({
    env: {
        appUrl: 'https://spm.example',
        authSecret: 'unit-only-abcdefghijklmnopqrstuvwxyz0123456789',
        encryptionKey: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    },
    isMailEnabled: mocks.enabled,
}));
import { inscrever } from '@/app/newsletter/actions';
import { decryptSensitive } from '@/lib/server/crypto';

const form = (email = 'person@example.test') => {
    const data = new FormData();
    data.set('email', email);
    return data;
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.origin.mockResolvedValue(undefined);
    mocks.meta.mockResolvedValue({ ip: null });
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.enabled.mockReturnValue(true);
    mocks.scope.mockImplementation((body: () => Promise<unknown>) => body());
    mocks.find.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'subscriber' });
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.queue.mockResolvedValue({ id: 'job' });
    mocks.transaction.mockImplementation((body: (tx: unknown) => Promise<unknown>) =>
        body({
            newsletterSubscriber: { create: mocks.create, updateMany: mocks.update },
            genericEmailJob: { create: mocks.queue },
        }),
    );
});
describe('newsletter request and encrypted delivery intent share a commit', () => {
    it('persists an unconfirmed source plus a versioned ciphertext job without claiming delivery', async () => {
        const result = await inscrever({ ok: false }, form());
        expect(result.ok).toBe(true);
        expect(result.message).toContain('Você receberá');
        const source = mocks.create.mock.calls[0][0].data;
        const queued = mocks.queue.mock.calls[0][0].data;
        expect(source.confirmed).toBe(false);
        expect(queued).toMatchObject({
            kind: 'NEWSLETTER_CONFIRMATION',
            newsletterSubscriberId: source.id,
            versionHash: source.confirmTokenHash,
            expiresAt: source.confirmExpiresAt,
        });
        expect(queued.payloadEncrypted).toMatch(/^v1\./);
        expect(queued.payloadEncrypted).not.toContain('person@example.test');
        const payload = JSON.parse(decryptSensitive(queued.payloadEncrypted)!);
        expect(new URL(payload.confirmUrl).origin).toBe('https://spm.example');
        expect(new URL(payload.confirmUrl).searchParams.get('token')).toMatch(
            /^[a-zA-Z0-9_-]{43}$/,
        );
        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(JSON.stringify(result)).not.toContain('person@example.test');
    });
    it('keeps disabled mail pending and clearly states the subscription is inactive', async () => {
        mocks.enabled.mockReturnValue(false);
        const result = await inscrever({ ok: false }, form());
        expect(result.ok).toBe(true);
        expect(result.message).toContain('ainda não está ativa');
        expect(result.message).not.toContain('SMTP');
        expect(mocks.queue).toHaveBeenCalledOnce();
        expect(mocks.create.mock.calls[0][0].data.confirmed).toBe(false);
    });
    it('cannot undo a competing confirmation when replacing a token', async () => {
        mocks.find.mockResolvedValue({ id: 'existing', confirmed: false });
        mocks.update.mockResolvedValue({ count: 0 });
        expect((await inscrever({ ok: false }, form())).ok).toBe(true);
        expect(mocks.update.mock.calls[0][0].where).toEqual({ id: 'existing', confirmed: false });
        expect(mocks.queue).not.toHaveBeenCalled();
    });
    it('retries one new-address unique race against the winning source without duplicate tokens', async () => {
        mocks.find
            .mockResolvedValueOnce(null)
            .mockResolvedValue({ id: 'winner', confirmed: false });
        mocks.create.mockRejectedValue({ code: 'P2002' });
        expect((await inscrever({ ok: false }, form())).ok).toBe(true);
        expect(mocks.transaction).toHaveBeenCalledTimes(2);
        expect(mocks.queue).toHaveBeenCalledOnce();
        expect(mocks.queue.mock.calls[0][0].data.newsletterSubscriberId).toBe('winner');
    });
    it('denies forged origin and invalid input before any database mutation', async () => {
        const { UntrustedOriginError } = await import('@/lib/server/request-origin');
        mocks.origin.mockRejectedValueOnce(new UntrustedOriginError());
        expect((await inscrever({ ok: false }, form())).ok).toBe(false);
        expect((await inscrever({ ok: false }, form('bad-email'))).ok).toBe(false);
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.queue).not.toHaveBeenCalled();
    });
    it('does not report success when transactional queue persistence fails or reveal details', async () => {
        mocks.queue.mockRejectedValue(new Error('DB connection secret'));
        const result = await inscrever({ ok: false }, form());
        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).not.toContain('DB connection secret');
    });
});
