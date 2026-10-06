import 'server-only';

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { prisma } from './db';
import { withContactMailDatabaseScope, withGenericMailDatabaseScope } from './database-scope';
import { decryptSensitive, encryptSensitive, hashToken } from './crypto';
import { env, isMailEnabled } from './env';
import { sendNewsletterConfirmation, sendUserInvite } from './mail';
import { processContactEmailJob } from './contact-email-outbox';
import { logError } from './logger';

const LEASE_MS = 5 * 60_000;
export const MAX_GENERIC_EMAIL_ATTEMPTS = 8;
const inviteSchema = z
    .object({
        name: z.string().min(1).max(120),
        email: z.email().max(180),
        inviteUrl: z.string().max(500),
        roleName: z.string().min(1).max(100),
    })
    .strict();
const newsletterSchema = z
    .object({ email: z.email().max(180), confirmUrl: z.string().max(700) })
    .strict();

export function inviteVersionHash(id: string, version: number): string {
    if (!id || !Number.isSafeInteger(version) || version < 1)
        throw new Error('Invalid invite version');
    return hashToken(`invite-version:v1:${id}:${version}`);
}
export function encryptInviteEmail(payload: z.infer<typeof inviteSchema>): string {
    return encryptSensitive(JSON.stringify(inviteSchema.parse(payload)))!;
}
export function encryptNewsletterEmail(payload: z.infer<typeof newsletterSchema>): string {
    return encryptSensitive(JSON.stringify(newsletterSchema.parse(payload)))!;
}
async function databaseNow(): Promise<Date> {
    const [row] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row || !Number.isFinite(row.now.getTime())) throw new Error('Database clock unavailable');
    return row.now;
}
function liveWhere(id: string, attempts: number, now: Date) {
    return {
        id,
        attempts,
        processedAt: null,
        deadLetterAt: null,
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    };
}

/** At-least-once delivery; ciphertext and version travel in the same source tx. */
export async function processGenericEmailJob(
    id: string,
    now?: Date,
): Promise<'sent' | 'failed' | 'skipped'> {
    if (!isMailEnabled()) return 'skipped';
    return withGenericMailDatabaseScope(async () => {
        const clock = now ?? (await databaseNow());
        if (!Number.isFinite(clock.getTime())) throw new Error('Invalid worker clock');
        const job = await prisma.genericEmailJob.findUnique({ where: { id } });
        if (
            !job ||
            job.processedAt ||
            job.deadLetterAt ||
            job.nextAttemptAt > clock ||
            (job.leaseUntil && job.leaseUntil > clock)
        )
            return 'skipped';
        if (job.expiresAt <= clock) {
            await prisma.genericEmailJob.updateMany({
                where: liveWhere(id, job.attempts, clock),
                data: { processedAt: clock, leaseToken: null, leaseUntil: null },
            });
            return 'skipped';
        }
        if (job.attempts >= MAX_GENERIC_EMAIL_ATTEMPTS) {
            const parked = await prisma.genericEmailJob.updateMany({
                where: liveWhere(id, job.attempts, clock),
                data: {
                    deadLetterAt: clock,
                    leaseToken: null,
                    leaseUntil: null,
                    failureCode: 'SMTP_SEND_FAILED',
                },
            });
            return parked.count ? 'failed' : 'skipped';
        }
        const leaseToken = randomUUID();
        const claimed = await prisma.genericEmailJob.updateMany({
            where: liveWhere(id, job.attempts, clock),
            data: {
                leaseToken,
                leaseUntil: new Date(clock.getTime() + LEASE_MS),
                attempts: { increment: 1 },
            },
        });
        if (claimed.count !== 1) return 'skipped';
        const leaseWhere = { id, leaseToken, processedAt: null, deadLetterAt: null };
        let failureCode: 'SMTP_SEND_FAILED' | 'PAYLOAD_INVALID' = 'PAYLOAD_INVALID';
        try {
            const plaintext = decryptSensitive(job.payloadEncrypted);
            if (!plaintext || plaintext.length > 2500) throw new Error('Invalid encrypted mail');
            const decoded: unknown = JSON.parse(plaintext);
            const messageId = `<spm-mail-${job.id}@spmnacional.org.br>`;
            let delivered: boolean;
            if (job.kind === 'USER_INVITE') {
                const payload = inviteSchema.parse(decoded);
                if (payload.inviteUrl !== new URL('/atendente', env.appUrl).href)
                    throw new Error('Invalid invite origin');
                const user = job.userId
                    ? await prisma.user.findUnique({
                          where: { id: job.userId },
                          select: {
                              id: true,
                              name: true,
                              email: true,
                              status: true,
                              notificationVersion: true,
                          },
                      })
                    : null;
                if (
                    !user ||
                    user.status !== 'ATIVO' ||
                    user.notificationVersion < 1 ||
                    inviteVersionHash(user.id, user.notificationVersion) !== job.versionHash ||
                    payload.email !== user.email ||
                    payload.name !== user.name
                ) {
                    await prisma.genericEmailJob.updateMany({
                        where: leaseWhere,
                        data: { processedAt: clock, leaseToken: null, leaseUntil: null },
                    });
                    return 'skipped';
                }
                failureCode = 'SMTP_SEND_FAILED';
                delivered = await sendUserInvite(payload, messageId);
            } else {
                const payload = newsletterSchema.parse(decoded);
                const url = new URL(payload.confirmUrl);
                const expected = new URL('/newsletter/confirmar', env.appUrl);
                const token = url.searchParams.get('token') ?? '';
                if (
                    url.origin !== expected.origin ||
                    url.pathname !== expected.pathname ||
                    url.hash ||
                    [...url.searchParams.keys()].some((key) => key !== 'token') ||
                    url.searchParams.getAll('token').length !== 1 ||
                    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
                    hashToken(token) !== job.versionHash
                )
                    throw new Error('Invalid confirmation link');
                const subscriber = job.newsletterSubscriberId
                    ? await prisma.newsletterSubscriber.findUnique({
                          where: { id: job.newsletterSubscriberId },
                          select: {
                              email: true,
                              confirmed: true,
                              unsubscribedAt: true,
                              confirmTokenHash: true,
                              confirmExpiresAt: true,
                          },
                      })
                    : null;
                if (
                    !subscriber ||
                    subscriber.confirmed ||
                    subscriber.unsubscribedAt ||
                    !subscriber.confirmExpiresAt ||
                    subscriber.confirmExpiresAt <= clock ||
                    subscriber.confirmTokenHash !== job.versionHash ||
                    subscriber.email !== payload.email
                ) {
                    await prisma.genericEmailJob.updateMany({
                        where: leaseWhere,
                        data: { processedAt: clock, leaseToken: null, leaseUntil: null },
                    });
                    return 'skipped';
                }
                failureCode = 'SMTP_SEND_FAILED';
                delivered = await sendNewsletterConfirmation(payload, messageId);
            }
            if (!delivered) throw new Error('SMTP did not confirm delivery');
            const completed = await prisma.genericEmailJob.updateMany({
                where: leaseWhere,
                data: { processedAt: clock, failureCode: null, leaseToken: null, leaseUntil: null },
            });
            return completed.count === 1 ? 'sent' : 'skipped';
        } catch (error) {
            logError('generic.email_failed', error, { attempt: job.attempts + 1 });
            const changed = await prisma.genericEmailJob.updateMany({
                where: leaseWhere,
                data: {
                    leaseToken: null,
                    leaseUntil: null,
                    failureCode,
                    nextAttemptAt: new Date(
                        clock.getTime() +
                            Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 10)),
                    ),
                    ...(job.attempts + 1 >= MAX_GENERIC_EMAIL_ATTEMPTS
                        ? { deadLetterAt: clock }
                        : {}),
                },
            });
            return changed.count === 1 ? 'failed' : 'skipped';
        }
    });
}

/** Both queues share the route budget: eight jobs total, concurrency two. */
export async function processPendingNotificationEmails() {
    const result = {
        sent: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        deadLetters: 0,
        smtpEnabled: isMailEnabled(),
    };
    if (result.smtpEnabled) {
        const clock = await databaseNow();
        const filter = {
            processedAt: null,
            deadLetterAt: null,
            nextAttemptAt: { lte: clock },
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: clock } }],
        };
        const [contact, generic] = await Promise.all([
            withContactMailDatabaseScope(() =>
                prisma.contactEmailJob.findMany({
                    where: filter,
                    orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
                    select: { id: true },
                    take: 4,
                }),
            ),
            withGenericMailDatabaseScope(() =>
                prisma.genericEmailJob.findMany({
                    where: filter,
                    orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
                    select: { id: true },
                    take: 4,
                }),
            ),
        ]);
        const jobs = [
            ...contact.map((job) => ({ ...job, kind: 'contact' as const })),
            ...generic.map((job) => ({ ...job, kind: 'generic' as const })),
        ];
        const started = performance.now();
        for (
            let index = 0;
            index < jobs.length && performance.now() - started < 120_000;
            index += 2
        ) {
            const outcomes = await Promise.all(
                jobs
                    .slice(index, index + 2)
                    .map((job) =>
                        job.kind === 'contact'
                            ? processContactEmailJob(job.id)
                            : processGenericEmailJob(job.id),
                    ),
            );
            for (const outcome of outcomes) result[outcome]++;
        }
    }
    const counts = await Promise.all([
        withContactMailDatabaseScope(() =>
            prisma.contactEmailJob.count({ where: { processedAt: null, deadLetterAt: null } }),
        ),
        withGenericMailDatabaseScope(() =>
            prisma.genericEmailJob.count({ where: { processedAt: null, deadLetterAt: null } }),
        ),
        withContactMailDatabaseScope(() =>
            prisma.contactEmailJob.count({
                where: { processedAt: null, deadLetterAt: { not: null } },
            }),
        ),
        withGenericMailDatabaseScope(() =>
            prisma.genericEmailJob.count({
                where: { processedAt: null, deadLetterAt: { not: null } },
            }),
        ),
    ]);
    result.pending = counts[0] + counts[1];
    result.deadLetters = counts[2] + counts[3];
    return result;
}

export async function retryDeadLetterGenericEmail(id: string): Promise<boolean> {
    if (!id || id.length > 256) return false;
    return withGenericMailDatabaseScope(async () => {
        const clock = await databaseNow();
        const changed = await prisma.genericEmailJob.updateMany({
            where: {
                id,
                processedAt: null,
                deadLetterAt: { not: null },
                expiresAt: { gt: clock },
                leaseToken: null,
                OR: [{ leaseUntil: null }, { leaseUntil: { lte: clock } }],
            },
            data: {
                attempts: 0,
                deadLetterAt: null,
                failureCode: null,
                nextAttemptAt: clock,
                leaseUntil: null,
            },
        });
        return changed.count === 1;
    });
}
