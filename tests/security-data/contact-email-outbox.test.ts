import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    enabled: vi.fn(),
    scope: vi.fn(),
    clock: vi.fn(),
    jobs: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    message: vi.fn(),
    notify: vi.fn(),
    acknowledge: vi.fn(),
    log: vi.fn(),
}));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        contactEmailJob: mocks.jobs,
        contactMessage: { findUnique: mocks.message },
        $queryRaw: mocks.clock,
    },
}));
vi.mock('@/lib/server/database-scope', () => ({ withContactMailDatabaseScope: mocks.scope }));
vi.mock('@/lib/server/env', () => ({ isMailEnabled: mocks.enabled }));
vi.mock('@/lib/server/crypto', () => ({
    decryptSensitive: (value: string | null) =>
        value?.startsWith('cipher:') ? value.slice(7) : null,
}));
vi.mock('@/lib/server/mail', () => ({
    sendContactNotification: mocks.notify,
    sendContactAcknowledgement: mocks.acknowledge,
}));
vi.mock('@/lib/server/logger', () => ({ logError: mocks.log }));
import {
    processContactEmailJob,
    processPendingContactEmails,
    retryDeadLetterContactEmail,
} from '@/lib/server/contact-email-outbox';

const now = new Date('2026-10-02T12:00:00Z');
const id = 'f6623d88-a368-4aef-9aa3-cb32e376c490';
const job = (extra = {}) => ({
    id,
    contactMessageId: 'synthetic-message',
    kind: 'NOTIFICATION',
    attempts: 0,
    processedAt: null,
    deadLetterAt: null,
    nextAttemptAt: now,
    leaseToken: null,
    leaseUntil: null,
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
    mocks.jobs.count.mockImplementation(async ({ where }) => (where.deadLetterAt ? 0 : 5));
    mocks.message.mockResolvedValue({
        name: 'cipher:Pessoa sintética',
        email: 'cipher:person@example.test',
        phone: null,
        city: null,
        subject: 'Teste',
        language: 'Português',
        message: 'cipher:Mensagem sintética',
        encryptedAt: now,
    });
    mocks.notify.mockResolvedValue(true);
    mocks.acknowledge.mockResolvedValue(true);
});

describe('durable contact delivery, with no live SMTP', () => {
    it('does not claim or consume attempts while SMTP is disabled', async () => {
        mocks.enabled.mockReturnValue(false);
        expect(await processContactEmailJob(id)).toBe('skipped');
        expect(mocks.jobs.findUnique).not.toHaveBeenCalled();
        const result = await processPendingContactEmails();
        expect(result).toMatchObject({ smtpEnabled: false, pending: 5, sent: 0, failed: 0 });
        expect(mocks.jobs.updateMany).not.toHaveBeenCalled();
        expect(mocks.jobs.findMany).not.toHaveBeenCalled();
        expect(mocks.clock).not.toHaveBeenCalled();
        expect(mocks.notify).not.toHaveBeenCalled();
    });
    it.each([
        { processedAt: now },
        { deadLetterAt: now },
        { nextAttemptAt: new Date(now.getTime() + 1) },
        { leaseUntil: new Date(now.getTime() + 1) },
    ])('skips completed, delayed and live-leased records: %j', async (extra) => {
        mocks.jobs.findUnique.mockResolvedValue(job(extra));
        expect(await processContactEmailJob(id, now)).toBe('skipped');
        expect(mocks.jobs.updateMany).not.toHaveBeenCalled();
        expect(mocks.message).not.toHaveBeenCalled();
    });
    it('claims with CAS before decrypting and completes only its lease', async () => {
        expect(await processContactEmailJob(id)).toBe('sent');
        expect(mocks.clock.mock.calls[0][0].join('')).toContain('clock_timestamp()');
        const claim = mocks.jobs.updateMany.mock.calls[0][0];
        expect(claim.where).toMatchObject({
            id,
            attempts: 0,
            processedAt: null,
            deadLetterAt: null,
            nextAttemptAt: { lte: now },
        });
        expect(claim.data.attempts).toEqual({ increment: 1 });
        expect(claim.data.leaseUntil.getTime() - now.getTime()).toBe(5 * 60_000);
        expect(mocks.jobs.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.message.mock.invocationCallOrder[0],
        );
        expect(mocks.jobs.updateMany.mock.calls[1][0].where).toMatchObject({
            id,
            leaseToken: claim.data.leaseToken,
        });
        expect(mocks.notify).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'person@example.test' }),
            `<spm-contact-${id}@spmnacional.org.br>`,
        );
    });
    it('a losing lease claim does not read PII or send another copy', async () => {
        let claimed = false;
        mocks.jobs.updateMany.mockImplementation(async ({ data }) => {
            if (!data.attempts) return { count: 1 };
            if (claimed) return { count: 0 };
            claimed = true;
            return { count: 1 };
        });
        const results = await Promise.all([
            processContactEmailJob(id, now),
            processContactEmailJob(id, now),
        ]);
        expect(results.sort()).toEqual(['sent', 'skipped']);
        expect(mocks.notify).toHaveBeenCalledOnce();
        expect(mocks.message).toHaveBeenCalledOnce();
    });
    it('uses a fixed Message-ID for acknowledgment retries', async () => {
        mocks.jobs.findUnique.mockResolvedValue(job({ kind: 'ACKNOWLEDGEMENT' }));
        expect(await processContactEmailJob(id, now)).toBe('sent');
        mocks.jobs.findUnique.mockResolvedValue(job({ kind: 'ACKNOWLEDGEMENT', attempts: 1 }));
        expect(await processContactEmailJob(id, now)).toBe('sent');
        expect(mocks.acknowledge.mock.calls.map((call) => call[1])).toEqual([
            `<spm-contact-${id}@spmnacional.org.br>`,
            `<spm-contact-${id}@spmnacional.org.br>`,
        ]);
        expect(mocks.notify).not.toHaveBeenCalled();
    });
    it('preserves a failed intention, schedules backoff, and never stores provider error text', async () => {
        mocks.notify.mockRejectedValue(new Error('private@example.test provider secret'));
        expect(await processContactEmailJob(id, now)).toBe('failed');
        const failure = mocks.jobs.updateMany.mock.calls[1][0].data;
        expect(failure).toMatchObject({
            leaseToken: null,
            leaseUntil: null,
            failureCode: 'SMTP_SEND_FAILED',
        });
        expect(failure.nextAttemptAt.getTime() - now.getTime()).toBe(60_000);
        expect(JSON.stringify(mocks.jobs.updateMany.mock.calls)).not.toMatch(
            /private@example|provider secret/,
        );
    });
    it.each(['missing', 'corrupt'])(
        'fails closed before SMTP for unavailable PII: %s',
        async (reason) => {
            mocks.message.mockResolvedValue(
                reason === 'missing' ? null : { name: 'corrupt', encryptedAt: now },
            );
            expect(await processContactEmailJob(id, now)).toBe('failed');
            expect(mocks.jobs.updateMany.mock.calls[1][0].data.failureCode).toBe('MESSAGE_MISSING');
            expect(mocks.notify).not.toHaveBeenCalled();
        },
    );
    it('parks the eighth failed delivery and expired crash leases instead of retrying forever', async () => {
        mocks.jobs.findUnique.mockResolvedValue(job({ attempts: 7 }));
        mocks.notify.mockResolvedValue(false);
        expect(await processContactEmailJob(id, now)).toBe('failed');
        expect(mocks.jobs.updateMany.mock.calls[1][0].data.deadLetterAt).toBe(now);
        mocks.jobs.updateMany.mockClear();
        mocks.notify.mockClear();
        mocks.jobs.findUnique.mockResolvedValue(
            job({ attempts: 8, leaseUntil: new Date(now.getTime() - 1) }),
        );
        expect(await processContactEmailJob(id, now)).toBe('failed');
        expect(mocks.jobs.updateMany).toHaveBeenCalledOnce();
        expect(mocks.jobs.updateMany.mock.calls[0][0].data.deadLetterAt).toBe(now);
        expect(mocks.notify).not.toHaveBeenCalled();
    });
    it('bounds a cycle to eight records and two concurrent deliveries', async () => {
        mocks.jobs.findMany.mockResolvedValue(
            Array.from({ length: 8 }, (_, index) => ({ id: `${id}-${index}` })),
        );
        mocks.jobs.findUnique.mockImplementation(async ({ where }) => job({ id: where.id }));
        let active = 0;
        let maximum = 0;
        mocks.notify.mockImplementation(async () => {
            maximum = Math.max(maximum, ++active);
            await new Promise((resolve) => setTimeout(resolve, 1));
            active--;
            return true;
        });
        const result = await processPendingContactEmails(10_000);
        expect(result.sent).toBe(8);
        expect(maximum).toBe(2);
        expect(mocks.jobs.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 8 }));
        expect(JSON.stringify(result)).not.toContain('person@example');
    });
    it('resets only an inactive dead letter after an authenticated operational repair', async () => {
        expect(await retryDeadLetterContactEmail(id)).toBe(true);
        expect(mocks.jobs.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id,
                    processedAt: null,
                    deadLetterAt: { not: null },
                    leaseToken: null,
                }),
                data: expect.objectContaining({
                    attempts: 0,
                    nextAttemptAt: now,
                    deadLetterAt: null,
                }),
            }),
        );
        expect(mocks.notify).not.toHaveBeenCalled();
        expect(mocks.acknowledge).not.toHaveBeenCalled();
    });
});
