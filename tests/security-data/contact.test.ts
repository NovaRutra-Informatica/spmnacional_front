import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    origin: vi.fn(),
    meta: vi.fn(),
    limit: vi.fn(),
    create: vi.fn(),
    scope: vi.fn(),
    encrypt: vi.fn(),
    notify: vi.fn(),
    acknowledge: vi.fn(),
    audit: vi.fn(),
    findAttempt: vi.fn(),
    claimAttempt: vi.fn(),
    transaction: vi.fn(),
    enqueueMail: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        contactMessage: { create: mocks.create },
        idempotencyRequest: { findUnique: mocks.findAttempt },
        $transaction: mocks.transaction,
    },
}));
vi.mock('@/lib/server/database-scope', () => ({ withPublicContactDatabaseScope: mocks.scope }));
vi.mock('@/lib/server/request-origin', async (original) => ({
    ...(await original<object>()),
    assertTrustedMutationOrigin: mocks.origin,
}));
vi.mock('@/lib/server/audit', () => ({ requestMeta: mocks.meta, recordAudit: mocks.audit }));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.limit }));
vi.mock('@/lib/server/crypto', async (original) => ({
    ...(await original<object>()),
    encryptSensitive: mocks.encrypt,
}));
vi.mock('@/lib/server/mail', () => ({
    sendContactNotification: mocks.notify,
    sendContactAcknowledgement: mocks.acknowledge,
}));
vi.mock('@/lib/server/logger', () => ({ logError: vi.fn() }));
import { enviarMensagem } from '@/app/fale-conosco/actions';
import { CONTACT_SUBJECTS } from '@/app/fale-conosco/options';

const form = (extra: Record<string, string> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({
        name: 'Pessoa de teste',
        email: 'person@example.test',
        phone: '',
        city: 'Cidade',
        subject: CONTACT_SUBJECTS[0],
        language: 'Português',
        message: 'Esta é uma mensagem sintética de teste.',
        idempotencyKey: 'f6623d88-a368-4aef-9aa3-cb32e376c490',
        ...extra,
    }))
        data.set(key, value);
    return data;
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.origin.mockResolvedValue(undefined);
    mocks.meta.mockResolvedValue({ ip: '203.0.113.2' });
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.encrypt.mockImplementation((value) => (value ? `encrypted:${value}` : null));
    mocks.create.mockResolvedValue({ id: 'private-row-id' });
    mocks.scope.mockImplementation((body: () => Promise<unknown>) => body());
    mocks.notify.mockResolvedValue(false);
    mocks.acknowledge.mockResolvedValue(false);
    mocks.findAttempt.mockResolvedValue(null);
    mocks.claimAttempt.mockResolvedValue({ keyHash: 'synthetic-key-hash' });
    mocks.transaction.mockImplementation(async (body: (tx: unknown) => Promise<unknown>) =>
        body({
            idempotencyRequest: { findUnique: mocks.findAttempt, create: mocks.claimAttempt },
            contactMessage: { create: mocks.create },
            auditLog: { create: mocks.audit },
            contactEmailJob: { createMany: mocks.enqueueMail },
        }),
    );
});

describe('public contact is bounded, scoped and returns no database identity', () => {
    it('creates encrypted data in the public-only RLS scope and returns no PII/internal ID', async () => {
        const result = await enviarMensagem(
            { ok: false },
            form({
                id: 'attacker-id',
                assignedToId: 'attacker',
                status: 'RESPONDIDA',
                encryptedAt: 'attacker',
                ip: 'spoofed',
            }),
        );
        expect(result).toEqual({
            ok: true,
            message: 'Recebemos seu contato. Responderemos o mais breve possível.',
        });
        expect(mocks.scope).toHaveBeenCalledTimes(2);
        expect(mocks.claimAttempt).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    keyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
                    payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
                }),
            }),
        );
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: null,
                    ip: null,
                    userAgent: null,
                    metadata: { contactMessageId: 'private-row-id' },
                }),
            }),
        );
        expect(mocks.enqueueMail).toHaveBeenCalledWith({
            data: [
                { contactMessageId: 'private-row-id', kind: 'NOTIFICATION' },
                { contactMessageId: 'private-row-id', kind: 'ACKNOWLEDGEMENT' },
            ],
        });
        expect(mocks.notify).not.toHaveBeenCalled();
        expect(mocks.acknowledge).not.toHaveBeenCalled();
        const write = mocks.create.mock.calls[0][0];
        expect(write.select).toEqual({ id: true });
        expect(write.data.name).toMatch(/^encrypted:/);
        expect(write.data).toMatchObject({ ip: null, userAgent: null });
        for (const key of ['id', 'assignedToId', 'status'])
            expect(write.data).not.toHaveProperty(key);
        expect(JSON.stringify(result)).not.toMatch(/person@example|Pessoa de teste|private-row-id/);
    });
    it('rejects foreign origin before limiter, public scope and mutation', async () => {
        const { UntrustedOriginError } = await import('@/lib/server/request-origin');
        mocks.origin.mockRejectedValue(new UntrustedOriginError());
        expect((await enviarMensagem({ ok: false }, form())).ok).toBe(false);
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(mocks.scope).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('does not persist honeypot submissions or send notifications', async () => {
        expect((await enviarMensagem({ ok: false }, form({ website: 'robot' }))).ok).toBe(true);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.notify).not.toHaveBeenCalled();
    });
    it('checks backend bounds before persistence and caps reflected form data', async () => {
        const result = await enviarMensagem(
            { ok: false },
            form({ name: 'a'.repeat(1000), message: 'a'.repeat(20_000) }),
        );
        expect(result.ok).toBe(false);
        expect(result.fieldErrors).toHaveProperty('message');
        const values = result.data?.values as Record<string, string>;
        expect(values.name.length).toBe(120);
        expect(values.message.length).toBe(5000);
        expect(mocks.scope).not.toHaveBeenCalled();
    });
    it.each(['denied', 'unavailable'])(
        'does not bypass a failed rate limiter: %s',
        async (reason) => {
            if (reason === 'denied') mocks.limit.mockResolvedValue({ allowed: false });
            else mocks.limit.mockRejectedValue(new Error('private database detail'));
            const result = await enviarMensagem({ ok: false }, form());
            expect(result.ok).toBe(false);
            expect(JSON.stringify(result)).not.toContain('private database detail');
            expect(mocks.transaction).not.toHaveBeenCalled();
            expect(mocks.claimAttempt).not.toHaveBeenCalled();
            expect(mocks.notify).not.toHaveBeenCalled();
        },
    );
    it('queues durable delivery without calling unavailable SMTP in the public action', async () => {
        mocks.notify.mockRejectedValue(new Error('SMTP detail'));
        expect((await enviarMensagem({ ok: false }, form())).ok).toBe(true);
        expect(mocks.create).toHaveBeenCalledOnce();
        expect(mocks.enqueueMail).toHaveBeenCalledOnce();
        expect(mocks.notify).not.toHaveBeenCalled();
    });
    it.each(['', 'caller-id', 'f6623d88-a368-1aef-9aa3-cb32e376c490'])(
        'validates the retry UUID before database access: %s',
        async (idempotencyKey) => {
            const result = await enviarMensagem({ ok: false }, form({ idempotencyKey }));
            expect(result.ok).toBe(false);
            expect(result.fieldErrors?.idempotencyKey).toBeTruthy();
            expect(mocks.scope).not.toHaveBeenCalled();
            expect(mocks.limit).not.toHaveBeenCalled();
        },
    );
    it('returns a previous committed result without quota use, mutation or notification', async () => {
        const { contactPayloadHash } = await import('@/lib/server/contact-idempotency');
        const data = form();
        const payload = Object.fromEntries(data.entries()) as Record<string, string>;
        mocks.findAttempt.mockResolvedValue({
            payloadHash: contactPayloadHash(payload as never),
            expiresAt: new Date(Date.now() + 60_000),
        });
        const result = await enviarMensagem({ ok: false }, data);
        expect(result).toEqual({
            ok: true,
            message: 'Recebemos seu contato. Responderemos o mais breve possível.',
        });
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.notify).not.toHaveBeenCalled();
        expect(mocks.acknowledge).not.toHaveBeenCalled();
    });
    it.each(['changed-content', 'expired'])(
        'rejects reuse of a committed attempt: %s',
        async (reason) => {
            mocks.findAttempt.mockResolvedValue({
                payloadHash: 'a'.repeat(64),
                expiresAt: new Date(Date.now() + (reason === 'expired' ? -1 : 60_000)),
            });
            const result = await enviarMensagem({ ok: false }, form());
            expect(result.ok).toBe(false);
            expect(result.fieldErrors?.idempotencyKey).toBeTruthy();
            expect(result.message).toContain(reason === 'expired' ? 'expirou' : 'outro conteúdo');
            expect(mocks.create).not.toHaveBeenCalled();
            expect(mocks.notify).not.toHaveBeenCalled();
        },
    );
    it('rechecks a competing commit inside the transaction before claim or message creation', async () => {
        const { contactPayloadHash } = await import('@/lib/server/contact-idempotency');
        const data = form();
        mocks.findAttempt.mockResolvedValueOnce(null).mockResolvedValue({
            payloadHash: contactPayloadHash(Object.fromEntries(data.entries()) as never),
            expiresAt: new Date(Date.now() + 60_000),
        });
        expect((await enviarMensagem({ ok: false }, data)).ok).toBe(true);
        expect(mocks.claimAttempt).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.notify).not.toHaveBeenCalled();
    });
    it('reads the winning commit after a unique-claim race without repeating the insert', async () => {
        const { contactPayloadHash } = await import('@/lib/server/contact-idempotency');
        const data = form();
        const committed = {
            payloadHash: contactPayloadHash(Object.fromEntries(data.entries()) as never),
            expiresAt: new Date(Date.now() + 60_000),
        };
        mocks.findAttempt
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValue(committed);
        mocks.claimAttempt.mockRejectedValue({ code: 'P2002' });
        expect((await enviarMensagem({ ok: false }, data)).ok).toBe(true);
        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(mocks.claimAttempt).toHaveBeenCalledOnce();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.notify).not.toHaveBeenCalled();
    });
    it('never treats a missing winning claim or arbitrary infrastructure error as success', async () => {
        mocks.claimAttempt.mockRejectedValue({ code: 'P2002' });
        expect((await enviarMensagem({ ok: false }, form())).ok).toBe(false);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.notify).not.toHaveBeenCalled();
    });
});
