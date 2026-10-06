import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const model = () => ({
        findMany: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn(),
    });
    return {
        db: {
            contactMessage: model(),
            idempotencyRequest: model(),
            genericEmailJob: model(),
            atendimento: model(),
            atendimentoEncaminhamento: model(),
            auditLog: model(),
            rateLimitBucket: model(),
            session: model(),
            loginAttempt: model(),
            user: model(),
            newsletterSubscriber: model(),
            $transaction: vi.fn(),
        },
        encrypt: vi.fn((value) => (value ? `encrypted:${value}` : null)),
    };
});
vi.mock('@/lib/server/db', () => ({ prisma: mocks.db }));
vi.mock('@/lib/server/crypto', () => ({ encryptSensitive: mocks.encrypt }));
import { executeDataRetention } from '@/lib/server/data-retention';

describe('retention transaction integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const model of Object.values(mocks.db)) {
            if (typeof model === 'function') continue;
            model.findMany.mockResolvedValue([]);
            model.updateMany.mockResolvedValue({ count: 1 });
            model.deleteMany.mockResolvedValue({ count: 1 });
            model.create.mockResolvedValue({});
        }
        mocks.db.$transaction.mockImplementation(async (work) =>
            typeof work === 'function' ? work(mocks.db) : Promise.all(work),
        );
    });

    it('uses calendar-month cutoff including leap days, with bounded batch options', async () => {
        const result = await executeDataRetention({
            now: new Date('2024-02-29T14:25:30.000Z'),
            batchSize: 999,
            maxBatches: -2,
        });
        expect(result.cutoff).toBe('2022-02-28T14:25:30.000Z');
        expect(result.batchSize).toBe(500);
        expect(result.maxBatches).toBe(1);
        expect(result.continuationRequired).toBe(false);
        expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects invalid reference dates before any mutation', async () => {
        await expect(executeDataRetention({ now: new Date('invalid') })).rejects.toThrow();
        expect(mocks.db.contactMessage.findMany).not.toHaveBeenCalled();
    });

    it('clears expired encrypted email intents in bounded batches with expiry repeated in deletion', async () => {
        const now = new Date('2026-10-02T12:00:00Z');
        mocks.db.genericEmailJob.findMany.mockResolvedValueOnce([{ id: 'expired-job' }]);
        const result = await executeDataRetention({ now, batchSize: 2 });
        expect(result.processed.genericEmailJobsDeleted).toBe(1);
        expect(mocks.db.genericEmailJob.findMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: now } },
            orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }], take: 2, select: { id: true } });
        expect(mocks.db.genericEmailJob.deleteMany).toHaveBeenCalledWith({ where: {
            id: { in: ['expired-job'] }, expiresAt: { lte: now },
        } });
        expect(JSON.stringify(mocks.db.auditLog.create.mock.calls)).not.toContain('payloadEncrypted');
    });

    it('does not erase referrals or audit references if eligibility changed since selection', async () => {
        mocks.db.atendimento.findMany.mockResolvedValueOnce([
            { id: 'a', codigo: 'SPM-A', encerradoEm: null },
        ]);
        mocks.db.atendimento.updateMany.mockResolvedValueOnce({ count: 0 });
        const result = await executeDataRetention();
        expect(result.processed.atendimentosAnonymized).toBe(0);
        expect(mocks.db.atendimentoEncaminhamento.deleteMany).not.toHaveBeenCalled();
        expect(mocks.db.auditLog.updateMany).not.toHaveBeenCalled();
    });

    it('anonymizes eligible rows before deleting their correlation references inside one transaction', async () => {
        mocks.db.atendimento.findMany.mockResolvedValueOnce([
            { id: 'a', codigo: 'SPM-A', encerradoEm: null },
            { id: 'b', codigo: 'SPM-B', encerradoEm: null },
        ]);
        mocks.db.atendimento.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 0 });
        const result = await executeDataRetention();
        expect(result.processed.atendimentosAnonymized).toBe(1);
        expect(mocks.db.atendimentoEncaminhamento.deleteMany).toHaveBeenCalledWith({
            where: { atendimentoId: { in: ['a'] } },
        });
        expect(mocks.db.auditLog.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { target: { in: ['SPM-A'] } } }),
        );
        expect(mocks.db.atendimento.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.db.atendimentoEncaminhamento.deleteMany.mock.invocationCallOrder[0],
        );
        expect(mocks.db.atendimento.updateMany.mock.calls[0][0].data).toMatchObject({
            nomeEncrypted: null,
            contatoEncrypted: null,
            observacoes: null,
            status: 'ENCERRADO',
        });
    });

    it('does not renew retention or overwrite a concurrent contact edit during legacy encryption', async () => {
        const updatedAt = new Date('2025-01-01T00:00:00Z');
        mocks.db.contactMessage.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
            {
                id: 'contact',
                name: 'Name',
                email: 'person@test',
                phone: null,
                city: null,
                message: 'Confidential',
                internalNote: null,
                updatedAt,
            },
        ]);
        const result = await executeDataRetention();
        expect(result.processed.contactMessagesEncrypted).toBe(1);
        expect(mocks.db.contactMessage.updateMany).toHaveBeenCalledWith({
            where: { id: 'contact', encryptedAt: null, updatedAt },
            data: expect.objectContaining({
                name: 'encrypted:Name',
                message: 'encrypted:Confidential',
                ip: null,
                userAgent: null,
                updatedAt,
            }),
        });
        expect(JSON.stringify(mocks.db.auditLog.create.mock.calls)).not.toContain('Confidential');
    });

    it('signals continuation when a bounded batch remains full', async () => {
        mocks.db.contactMessage.findMany
            .mockResolvedValueOnce([{ id: 'old' }])
            .mockResolvedValueOnce([]);
        const result = await executeDataRetention({ batchSize: 1, maxBatches: 1 });
        expect(result.continuationRequired).toBe(true);
        expect(result.processed.contactMessagesDeleted).toBe(1);
    });
});
