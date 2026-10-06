import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    query: vi.fn(),
    mediaFind: vi.fn(),
    mediaDelete: vi.fn(),
    mediaCount: vi.fn(),
    jobCreate: vi.fn(),
    jobFind: vi.fn(),
    jobFindMany: vi.fn(),
    jobUpdate: vi.fn(),
    jobDelete: vi.fn(),
    jobCount: vi.fn(),
    transaction: vi.fn(),
    deleteFile: vi.fn(),
    log: vi.fn(),
}));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        $transaction: mocks.transaction,
        media: { count: mocks.mediaCount },
        mediaDeletion: {
            findUnique: mocks.jobFind,
            findMany: mocks.jobFindMany,
            updateMany: mocks.jobUpdate,
            deleteMany: mocks.jobDelete,
            count: mocks.jobCount,
        },
    },
}));
vi.mock('@/lib/server/storage', () => ({ deleteFile: mocks.deleteFile }));
vi.mock('@/lib/server/logger', () => ({ logError: mocks.log }));
import {
    processMediaDeletion,
    processPendingMediaDeletions,
    queueMediaDeletion,
    retryDeadLetterMediaDeletion,
    MAX_MEDIA_DELETION_ATTEMPTS,
} from '@/lib/server/media-deletion';

const now = new Date('2026-09-14T12:00:00Z');
const job = {
    id: 'job-1',
    storageKey: 'uploads/photo.png',
    attempts: 0,
    nextAttemptAt: now,
    leaseToken: null,
    deadLetterAt: null,
};

describe('durable media cleanup queue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.query.mockResolvedValue([{ id: 'media' }]);
        mocks.mediaFind.mockResolvedValue({
            id: 'media',
            originalName: 'photo.png',
            storageKey: job.storageKey,
            _count: { posts: 0, editais: 0, documentos: 0, materiais: 0 },
        });
        mocks.mediaDelete.mockResolvedValue({});
        mocks.jobCreate.mockResolvedValue({ id: 'job-1' });
        mocks.jobFind.mockResolvedValue({ ...job });
        mocks.jobFindMany.mockResolvedValue([{ id: 'job-1' }]);
        mocks.jobUpdate.mockResolvedValue({ count: 1 });
        mocks.jobDelete.mockResolvedValue({ count: 1 });
        mocks.jobCount.mockResolvedValue(0);
        mocks.mediaCount.mockResolvedValue(0);
        mocks.deleteFile.mockResolvedValue(undefined);
        mocks.transaction.mockImplementation(async (work) =>
            work({
                $queryRaw: mocks.query,
                media: { findUnique: mocks.mediaFind, delete: mocks.mediaDelete },
                mediaDeletion: { create: mocks.jobCreate },
            }),
        );
    });

    it('locks and rechecks uses before committing the cleanup intent and deleting metadata', async () => {
        const result = await queueMediaDeletion('media');
        expect(result).toMatchObject({ ok: true, jobId: 'job-1', mediaId: 'media' });
        expect(mocks.query.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
        expect(mocks.query.mock.calls[0][1]).toBe('media');
        expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.mediaFind.mock.invocationCallOrder[0],
        );
        expect(mocks.jobCreate.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.mediaDelete.mock.invocationCallOrder[0],
        );
        expect(mocks.deleteFile).not.toHaveBeenCalled();
    });

    it('does not remove an absent or referenced file', async () => {
        mocks.mediaFind.mockResolvedValueOnce(null);
        expect(await queueMediaDeletion('missing')).toEqual({ ok: false, reason: 'missing' });
        mocks.mediaFind.mockResolvedValueOnce({ id: 'media', _count: { posts: 1 } });
        expect(await queueMediaDeletion('used')).toEqual({ ok: false, reason: 'in-use' });
        expect(mocks.jobCreate).not.toHaveBeenCalled();
        expect(mocks.mediaDelete).not.toHaveBeenCalled();
    });

    it('does not remove metadata if the durable cleanup intent cannot be stored', async () => {
        mocks.jobCreate.mockRejectedValueOnce(new Error('DB unavailable'));
        await expect(queueMediaDeletion('media')).rejects.toThrow();
        expect(mocks.mediaDelete).not.toHaveBeenCalled();
    });

    it('claims one job, deletes the object, then acknowledges the matching lease', async () => {
        expect(await processMediaDeletion('job-1', now)).toBe('deleted');
        expect(mocks.jobUpdate.mock.calls[0][0]).toMatchObject({
            where: { id: 'job-1', nextAttemptAt: { lte: now } },
            data: { attempts: { increment: 1 } },
        });
        const lease = mocks.jobUpdate.mock.calls[0][0].data.leaseToken;
        expect(mocks.deleteFile).toHaveBeenCalledWith(job.storageKey);
        expect(mocks.jobDelete).toHaveBeenCalledWith({ where: { id: 'job-1', leaseToken: lease } });
    });

    it('loses a concurrent claim safely and respects active leases/backoff', async () => {
        mocks.jobUpdate.mockResolvedValueOnce({ count: 0 });
        expect(await processMediaDeletion('job-1', now)).toBe('skipped');
        mocks.jobFind.mockResolvedValueOnce({
            ...job,
            nextAttemptAt: new Date(now.getTime() + 1000),
        });
        expect(await processMediaDeletion('job-1', now)).toBe('skipped');
        mocks.jobFind.mockResolvedValueOnce(null);
        expect(await processMediaDeletion('gone', now)).toBe('skipped');
        expect(mocks.deleteFile).not.toHaveBeenCalled();
    });

    it('keeps a failed object tracked and schedules a retry without raw error material', async () => {
        mocks.deleteFile.mockRejectedValueOnce(new Error('private bucket credential'));
        expect(await processMediaDeletion('job-1', now)).toBe('failed');
        expect(mocks.jobDelete).not.toHaveBeenCalled();
        const retry = mocks.jobUpdate.mock.calls[1][0];
        expect(retry.data.nextAttemptAt).toEqual(new Date(now.getTime() + 60_000));
        expect(retry.data.leaseToken).toBeNull();
        expect(JSON.stringify(retry)).not.toContain('credential');
    });

    it('will not delete an object that a manual recovery put back into the library', async () => {
        mocks.mediaCount.mockResolvedValueOnce(1);
        expect(await processMediaDeletion('job-1', now)).toBe('failed');
        expect(mocks.deleteFile).not.toHaveBeenCalled();
        expect(mocks.jobDelete).not.toHaveBeenCalled();
    });

    it('leaves failed acknowledgements retryable after the physical object was removed', async () => {
        mocks.jobDelete.mockRejectedValueOnce(new Error('connection lost'));
        expect(await processMediaDeletion('job-1', now)).toBe('failed');
        expect(mocks.deleteFile).toHaveBeenCalledOnce();
        expect(mocks.jobUpdate).toHaveBeenCalledTimes(2);
    });

    it('bounds batch work and reports durable pending cleanup', async () => {
        mocks.jobFind.mockResolvedValue({ ...job, nextAttemptAt: new Date(0) });
        mocks.jobCount.mockResolvedValueOnce(5);
        const result = await processPendingMediaDeletions(999);
        expect(mocks.jobFindMany.mock.calls[0][0].take).toBe(20);
        expect(result).toEqual({ deleted: 1, failed: 0, skipped: 0, pending: 5, deadLetters: 0 });
        expect(mocks.jobFindMany.mock.calls[0][0].where.deadLetterAt).toBeNull();
    });

    it('parks the last failed attempt without storing upstream error material', async () => {
        mocks.jobFind.mockResolvedValueOnce({ ...job, attempts: MAX_MEDIA_DELETION_ATTEMPTS - 1 });
        mocks.deleteFile.mockRejectedValueOnce(new Error('secret provider payload'));
        expect(await processMediaDeletion(job.id, now)).toBe('failed');
        const final = mocks.jobUpdate.mock.calls[1][0];
        expect(final.data).toMatchObject({ deadLetterAt: now, failureCode: 'STORAGE_DELETE_FAILED', leaseToken: null });
        expect(JSON.stringify(final)).not.toContain('secret');
    });

    it('never calls storage for a parked poison job or repeatedly abandoned expired lease', async () => {
        mocks.jobFind.mockResolvedValueOnce({ ...job, deadLetterAt: now });
        expect(await processMediaDeletion(job.id, now)).toBe('skipped');
        mocks.jobFind.mockResolvedValueOnce({ ...job, attempts: MAX_MEDIA_DELETION_ATTEMPTS });
        expect(await processMediaDeletion(job.id, now)).toBe('failed');
        expect(mocks.jobUpdate).toHaveBeenCalledOnce();
        expect(mocks.jobUpdate.mock.calls[0][0].data.failureCode).toBe('LEASE_ATTEMPTS_EXHAUSTED');
        expect(mocks.deleteFile).not.toHaveBeenCalled();
    });

    it('replay is a compare-and-swap limited to parked jobs without a live lease', async () => {
        expect(await retryDeadLetterMediaDeletion(job.id, now)).toBe(true);
        expect(mocks.jobUpdate.mock.calls[0][0]).toEqual({
            where: { id: job.id, deadLetterAt: { not: null }, leaseToken: null },
            data: { deadLetterAt: null, failureCode: null, attempts: 0, nextAttemptAt: now },
        });
        mocks.jobUpdate.mockResolvedValueOnce({ count: 0 });
        expect(await retryDeadLetterMediaDeletion(job.id, now)).toBe(false);
        expect(await retryDeadLetterMediaDeletion('', now)).toBe(false);
        expect(mocks.deleteFile).not.toHaveBeenCalled();
    });
});
