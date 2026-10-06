import { afterAll, describe, expect, it } from 'vitest';
import './guard';
import { prisma } from '../../lib/server/db';
import { MAX_MEDIA_DELETION_ATTEMPTS, processMediaDeletion, processPendingMediaDeletions, retryDeadLetterMediaDeletion } from '../../lib/server/media-deletion';
afterAll(async () => prisma.$disconnect());

describe('outbox de storage e poison/DLQ no PostgreSQL descartável', () => {
    it('preserva poison após tentativas limitadas, sem bloquear outros jobs, e replay é único', async () => {
        const key = 'biblioteca/isolated-poison.png';
        const job = await prisma.mediaDeletion.create({ data: { storageKey: key } });
        const restored = await prisma.media.create({ data: { storageKey: key, filename: 'isolated.png', originalName: 'Synthetic', mimeType: 'image/png', size: 1, url: '/synthetic' } });
        const base = Date.now() + 1000;
        for (let index = 0; index < MAX_MEDIA_DELETION_ATTEMPTS; index++) {
            expect(await processMediaDeletion(job.id, new Date(base + index * 86_400_000))).toBe('failed');
        }
        const parked = await prisma.mediaDeletion.findUniqueOrThrow({ where: { id: job.id } });
        expect(parked.attempts).toBe(MAX_MEDIA_DELETION_ATTEMPTS);
        expect(parked.deadLetterAt).not.toBeNull();
        expect(parked.failureCode).toBe('OBJECT_REFERENCED');
        expect((await processPendingMediaDeletions()).deadLetters).toBe(1);
        const healthy = await prisma.mediaDeletion.create({ data: { storageKey: 'biblioteca/isolated-absent.png' } });
        expect(await processMediaDeletion(healthy.id)).toBe('deleted');
        const replays = await Promise.all(Array.from({ length: 20 }, () => retryDeadLetterMediaDeletion(job.id)));
        expect(replays.filter(Boolean)).toHaveLength(1);
        await prisma.media.delete({ where: { id: restored.id } });
        expect(await processMediaDeletion(job.id)).toBe('deleted');
        expect(await prisma.mediaDeletion.findUnique({ where: { id: job.id } })).toBeNull();
    });
});
