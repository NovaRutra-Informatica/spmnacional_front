import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    enabled: vi.fn(),
    scope: vi.fn(),
    clock: vi.fn(),
    source: vi.fn(),
    subscriber: vi.fn(),
    jobs: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    contactJobs: { findMany: vi.fn(), count: vi.fn() },
    contactSend: vi.fn(),
    invite: vi.fn(),
    newsletter: vi.fn(),
}));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        genericEmailJob: mocks.jobs,
        contactEmailJob: mocks.contactJobs,
        user: { findUnique: mocks.source },
        newsletterSubscriber: { findUnique: mocks.subscriber },
        $queryRaw: mocks.clock,
    },
}));
vi.mock('@/lib/server/database-scope', () => ({
    withGenericMailDatabaseScope: mocks.scope,
    withContactMailDatabaseScope: mocks.scope,
}));
vi.mock('@/lib/server/env', async (original) => ({
    ...(await original<object>()),
    isMailEnabled: mocks.enabled,
}));
vi.mock('@/lib/server/mail', () => ({
    sendUserInvite: mocks.invite,
    sendNewsletterConfirmation: mocks.newsletter,
}));
vi.mock('@/lib/server/contact-email-outbox', () => ({ processContactEmailJob: mocks.contactSend }));
vi.mock('@/lib/server/logger', () => ({ logError: vi.fn() }));
import {
    encryptInviteEmail,
    encryptNewsletterEmail,
    inviteVersionHash,
    processGenericEmailJob,
    processPendingNotificationEmails,
    retryDeadLetterGenericEmail,
} from '@/lib/server/generic-email-outbox';
import { hashToken } from '@/lib/server/crypto';
const now = new Date('2026-10-02T12:00:00Z');
const id = 'f6623d88-a368-4aef-9aa3-cb32e376c490';
const token = 'a'.repeat(43);
const source = {
    id: 'user-a',
    name: 'Pessoa sintética',
    email: 'person@example.test',
    status: 'ATIVO',
    notificationVersion: 1,
};
const payload = {
    name: source.name,
    email: source.email,
    roleName: 'Editor',
    inviteUrl: 'http://localhost:3147/atendente',
};
const job = (extra = {}) => ({
    id,
    userId: source.id,
    newsletterSubscriberId: null,
    kind: 'USER_INVITE',
    versionHash: inviteVersionHash(source.id, 1),
    payloadEncrypted: encryptInviteEmail(payload),
    expiresAt: new Date(now.getTime() + 60_000),
    attempts: 0,
    processedAt: null,
    deadLetterAt: null,
    leaseUntil: null,
    leaseToken: null,
    nextAttemptAt: now,
    ...extra,
});
beforeEach(() => {
    vi.resetAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.scope.mockImplementation((body: () => Promise<unknown>) => body());
    mocks.clock.mockResolvedValue([{ now }]);
    mocks.jobs.findUnique.mockResolvedValue(job());
    mocks.jobs.findMany.mockResolvedValue([{ id }]);
    mocks.jobs.updateMany.mockResolvedValue({ count: 1 });
    mocks.jobs.count.mockResolvedValue(0);
    mocks.contactJobs.findMany.mockResolvedValue([]);
    mocks.contactJobs.count.mockResolvedValue(0);
    mocks.source.mockResolvedValue(source);
    mocks.subscriber.mockResolvedValue({
        email: source.email,
        confirmed: false,
        unsubscribedAt: null,
        confirmExpiresAt: new Date(now.getTime() + 60_000),
        confirmTokenHash: hashToken(token),
    });
    mocks.invite.mockResolvedValue(true);
    mocks.newsletter.mockResolvedValue(true);
    mocks.contactSend.mockResolvedValue('sent');
});
describe('encrypted versioned newsletter and Workspace instruction delivery', () => {
    it('never claims, decrypts or sends when mail is disabled', async () => {
        mocks.enabled.mockReturnValue(false);
        expect(await processGenericEmailJob(id)).toBe('skipped');
        expect(mocks.jobs.findUnique).not.toHaveBeenCalled();
        expect((await processPendingNotificationEmails()).smtpEnabled).toBe(false);
        expect(mocks.jobs.findMany).not.toHaveBeenCalled();
        expect(mocks.jobs.updateMany).not.toHaveBeenCalled();
        expect(mocks.invite).not.toHaveBeenCalled();
    });
    it('checks the current source version and uses a stable Message-ID', async () => {
        expect(await processGenericEmailJob(id, now)).toBe('sent');
        expect(mocks.invite).toHaveBeenCalledWith(payload, `<spm-mail-${id}@spmnacional.org.br>`);
        expect(mocks.jobs.updateMany.mock.calls[0][0].data.attempts).toEqual({ increment: 1 });
        expect(mocks.jobs.updateMany.mock.calls[1][0].where.leaseToken).toBe(
            mocks.jobs.updateMany.mock.calls[0][0].data.leaseToken,
        );
    });
    it.each([
        { notificationVersion: 2 },
        { status: 'INATIVO' },
        { email: 'other@example.test' },
        { name: 'Changed' },
    ])('discards superseded or revoked instructions without SMTP: %j', async (changes) => {
        mocks.source.mockResolvedValue({ ...source, ...changes });
        expect(await processGenericEmailJob(id, now)).toBe('skipped');
        expect(mocks.invite).not.toHaveBeenCalled();
        expect(mocks.jobs.updateMany.mock.calls[1][0].data.processedAt).toBe(now);
    });
    it('discards expired intent before consuming a delivery attempt', async () => {
        mocks.jobs.findUnique.mockResolvedValue(job({ expiresAt: now }));
        expect(await processGenericEmailJob(id, now)).toBe('skipped');
        expect(mocks.jobs.updateMany.mock.calls[0][0].data).not.toHaveProperty('attempts');
        expect(mocks.source).not.toHaveBeenCalled();
        expect(mocks.invite).not.toHaveBeenCalled();
    });
    it.each(['plaintext', 'bad-origin'])(
        'fails safely for corrupted or unauthorized mail payload: %s',
        async (reason) => {
            mocks.jobs.findUnique.mockResolvedValue(
                job({
                    payloadEncrypted:
                        reason === 'plaintext'
                            ? 'private plaintext'
                            : encryptInviteEmail({
                                  ...payload,
                                  inviteUrl: 'https://evil.example/atendente',
                              }),
                }),
            );
            expect(await processGenericEmailJob(id, now)).toBe('failed');
            const saved = mocks.jobs.updateMany.mock.calls[1][0].data;
            expect(saved.failureCode).toBe('PAYLOAD_INVALID');
            expect(JSON.stringify(saved)).not.toContain('private plaintext');
            expect(mocks.invite).not.toHaveBeenCalled();
        },
    );
    it('only delivers the current unexpired newsletter token to its bound recipient', async () => {
        const confirmation = {
            email: source.email,
            confirmUrl: `http://localhost:3147/newsletter/confirmar?token=${token}`,
        };
        mocks.jobs.findUnique.mockResolvedValue(
            job({
                kind: 'NEWSLETTER_CONFIRMATION',
                userId: null,
                newsletterSubscriberId: 'subscriber-a',
                versionHash: hashToken(token),
                payloadEncrypted: encryptNewsletterEmail(confirmation),
            }),
        );
        expect(await processGenericEmailJob(id, now)).toBe('sent');
        expect(mocks.newsletter).toHaveBeenCalledWith(
            confirmation,
            `<spm-mail-${id}@spmnacional.org.br>`,
        );
        mocks.subscriber.mockResolvedValue({ email: source.email, confirmed: true });
        mocks.newsletter.mockClear();
        expect(await processGenericEmailJob(id, now)).toBe('skipped');
        expect(mocks.newsletter).not.toHaveBeenCalled();
    });
    it.each(['changed-token', 'expired-token', 'cancelled', 'wrong-recipient'])(
        'does not send a stale newsletter link: %s',
        async (reason) => {
            mocks.jobs.findUnique.mockResolvedValue(
                job({
                    kind: 'NEWSLETTER_CONFIRMATION',
                    userId: null,
                    newsletterSubscriberId: 'subscriber-a',
                    versionHash: hashToken(token),
                    payloadEncrypted: encryptNewsletterEmail({
                        email: source.email,
                        confirmUrl: `http://localhost:3147/newsletter/confirmar?token=${token}`,
                    }),
                }),
            );
            mocks.subscriber.mockResolvedValue({
                email: reason === 'wrong-recipient' ? 'other@example.test' : source.email,
                confirmed: false,
                unsubscribedAt: reason === 'cancelled' ? now : null,
                confirmTokenHash: reason === 'changed-token' ? 'b'.repeat(64) : hashToken(token),
                confirmExpiresAt: new Date(
                    now.getTime() + (reason === 'expired-token' ? -1 : 60_000),
                ),
            });
            expect(await processGenericEmailJob(id, now)).toBe('skipped');
            expect(mocks.newsletter).not.toHaveBeenCalled();
        },
    );
    it('parks the eighth failure without persisting provider tokens or errors', async () => {
        mocks.jobs.findUnique.mockResolvedValue(job({ attempts: 7 }));
        mocks.invite.mockRejectedValue(new Error('smtp secret token'));
        expect(await processGenericEmailJob(id, now)).toBe('failed');
        const failure = mocks.jobs.updateMany.mock.calls[1][0].data;
        expect(failure.deadLetterAt).toBe(now);
        expect(failure.failureCode).toBe('SMTP_SEND_FAILED');
        expect(JSON.stringify(failure)).not.toContain('smtp secret token');
    });
    it('shares a global maximum of eight jobs and two deliveries between both queues', async () => {
        mocks.contactJobs.findMany.mockResolvedValue(
            Array.from({ length: 4 }, (_, index) => ({ id: `contact-${index}` })),
        );
        mocks.jobs.findMany.mockResolvedValue(
            Array.from({ length: 4 }, (_, index) => ({ id: `generic-${index}` })),
        );
        let active = 0;
        let maximum = 0;
        const delivery = async () => {
            maximum = Math.max(maximum, ++active);
            await new Promise((resolve) => setTimeout(resolve, 1));
            active--;
            return true;
        };
        mocks.contactSend.mockImplementation(async () => {
            await delivery();
            return 'sent';
        });
        mocks.invite.mockImplementation(delivery);
        const result = await processPendingNotificationEmails();
        expect(result.sent).toBe(8);
        expect(maximum).toBe(2);
        expect(mocks.jobs.findMany.mock.calls[0][0].take).toBe(4);
        expect(mocks.contactJobs.findMany.mock.calls[0][0].take).toBe(4);
    });
    it('operational replay resets only a still-live dead letter and never delivers immediately', async () => {
        expect(await retryDeadLetterGenericEmail(id)).toBe(true);
        expect(mocks.jobs.updateMany.mock.calls[0][0].where).toMatchObject({
            id,
            processedAt: null,
            deadLetterAt: { not: null },
            expiresAt: { gt: now },
            leaseToken: null,
        });
        expect(mocks.invite).not.toHaveBeenCalled();
        expect(mocks.newsletter).not.toHaveBeenCalled();
    });
});
