import 'server-only';
import { prisma } from './db';

/** Operator replay changes only the lease-free parked intent. No provider import
 * or network request is part of this command; the next worker performs deletion.
 */
export async function retryDeadLetterMediaDeletion(jobId: string, now = new Date()): Promise<boolean> {
    if (!jobId || !Number.isFinite(now.getTime())) return false;
    const changed = await prisma.mediaDeletion.updateMany({
        where: { id: jobId, deadLetterAt: { not: null }, leaseToken: null },
        data: { deadLetterAt: null, failureCode: null, attempts: 0, nextAttemptAt: now },
    });
    return changed.count === 1;
}
