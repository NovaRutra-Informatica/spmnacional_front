import 'server-only';

import { randomUUID } from 'node:crypto';
import { prisma } from './db';
import { deleteFile } from './storage';
import { logError } from './logger';
export { retryDeadLetterMediaDeletion } from './media-deletion-retry';

const LEASE_MS = 5 * 60_000;
const MAX_BATCH_SIZE = 20;
export const MAX_MEDIA_DELETION_ATTEMPTS = 8;

type QueueResult =
    | { ok: false; reason: 'missing' | 'in-use' }
    | { ok: true; jobId: string; originalName: string; mediaId: string };

/**
 * A exclusão do registro e a intenção de excluir o objeto são um único commit.
 * O row lock também bloqueia referências novas via FK enquanto rechecamos usos.
 * Nunca mantenha a transação aberta durante uma chamada ao Cloud Storage.
 */
export async function queueMediaDeletion(mediaId: string): Promise<QueueResult> {
    return prisma.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Media" WHERE "id" = ${mediaId} FOR UPDATE`;
            const media = await tx.media.findUnique({
                where: { id: mediaId },
                select: {
                    id: true,
                    originalName: true,
                    storageKey: true,
                    _count: {
                        select: { posts: true, editais: true, documentos: true, materiais: true },
                    },
                },
            });
            if (!media) return { ok: false, reason: 'missing' };
            if (Object.values(media._count).some((count) => count > 0)) {
                return { ok: false, reason: 'in-use' };
            }
            const job = await tx.mediaDeletion.create({
                data: { storageKey: media.storageKey },
                select: { id: true },
            });
            await tx.media.delete({ where: { id: media.id } });
            return { ok: true, jobId: job.id, originalName: media.originalName, mediaId: media.id };
        },
        { maxWait: 5_000, timeout: 10_000 },
    );
}

export type DeletionOutcome = 'deleted' | 'failed' | 'skipped';

/** Tentativa idempotente com lease, sem expor erros do provedor no banco/log. */
export async function processMediaDeletion(
    jobId: string,
    now = new Date(),
): Promise<DeletionOutcome> {
    const job = await prisma.mediaDeletion.findUnique({ where: { id: jobId } });
    if (!job || job.deadLetterAt || job.nextAttemptAt > now) return 'skipped';
    // Repeated worker crashes also have a limit; expired leases cannot cause an
    // unbounded poison loop even when no worker reached its catch block.
    if (job.attempts >= MAX_MEDIA_DELETION_ATTEMPTS) {
        const parked = await prisma.mediaDeletion.updateMany({
            where: { id: jobId, deadLetterAt: null, attempts: job.attempts, nextAttemptAt: { lte: now } },
            data: { deadLetterAt: now, leaseToken: null, failureCode: 'LEASE_ATTEMPTS_EXHAUSTED' },
        });
        return parked.count ? 'failed' : 'skipped';
    }
    const leaseToken = randomUUID();
    const claimed = await prisma.mediaDeletion.updateMany({
        where: { id: jobId, deadLetterAt: null, attempts: job.attempts, nextAttemptAt: { lte: now } },
        data: {
            leaseToken,
            nextAttemptAt: new Date(now.getTime() + LEASE_MS),
            attempts: { increment: 1 },
        },
    });
    if (!claimed.count) return 'skipped';

    let failureCode = 'STORAGE_DELETE_FAILED';
    try {
        // Defesa para restaurações/manutenções manuais: nunca remova um objeto
        // que voltou a ser referenciado na biblioteca depois do agendamento.
        if (await prisma.media.count({ where: { storageKey: job.storageKey } })) {
            failureCode = 'OBJECT_REFERENCED';
            throw new Error('Deletion object is referenced again');
        }
        await deleteFile(job.storageKey);
        await prisma.mediaDeletion.deleteMany({ where: { id: jobId, leaseToken } });
        return 'deleted';
    } catch (error) {
        logError('media.deletion_failed', error, { attempt: job.attempts + 1 });
        const backoffMs = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 10));
        // Se a finalização falhar, o lease vence e outra execução repete o
        // DELETE (404/ENOENT é sucesso), mantendo rastreabilidade até concluir.
        await prisma.mediaDeletion.updateMany({
            where: { id: jobId, leaseToken },
            data: {
                leaseToken: null,
                nextAttemptAt: new Date(now.getTime() + backoffMs),
                failureCode,
                ...(job.attempts + 1 >= MAX_MEDIA_DELETION_ATTEMPTS ? { deadLetterAt: now } : {}),
            },
        });
        return 'failed';
    }
}

export interface MediaDeletionBatchResult {
    deleted: number;
    failed: number;
    skipped: number;
    pending: number;
    deadLetters: number;
}

/** Até 20 objetos por ciclo e quatro chamadas simultâneas ao provedor. */
export async function processPendingMediaDeletions(limit = 20): Promise<MediaDeletionBatchResult> {
    const bounded = Number.isFinite(limit)
        ? Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(limit)))
        : MAX_BATCH_SIZE;
    const now = new Date();
    const jobs = await prisma.mediaDeletion.findMany({
        where: { deadLetterAt: null, nextAttemptAt: { lte: now } },
        orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
        take: bounded,
    });
    const result = { deleted: 0, failed: 0, skipped: 0, pending: 0, deadLetters: 0 };
    for (let index = 0; index < jobs.length; index += 4) {
        const outcomes = await Promise.all(
            jobs.slice(index, index + 4).map(({ id }) => processMediaDeletion(id, now)),
        );
        for (const outcome of outcomes) result[outcome] += 1;
    }
    [result.pending, result.deadLetters] = await Promise.all([
        prisma.mediaDeletion.count({ where: { deadLetterAt: null } }),
        prisma.mediaDeletion.count({ where: { deadLetterAt: { not: null } } }),
    ]);
    return result;
}
