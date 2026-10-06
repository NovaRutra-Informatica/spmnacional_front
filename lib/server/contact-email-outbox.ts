import 'server-only';

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prisma } from './db';
import { withContactMailDatabaseScope } from './database-scope';
import { decryptSensitive } from './crypto';
import { isMailEnabled } from './env';
import { sendContactAcknowledgement, sendContactNotification } from './mail';
import { logError } from './logger';

export const MAX_CONTACT_EMAIL_ATTEMPTS = 8;
const LEASE_MS = 5 * 60_000;
const MAX_BATCH_SIZE = 8;
const BATCH_BUDGET_MS = 120_000;
type Outcome = 'sent' | 'failed' | 'skipped';

async function databaseNow(): Promise<Date> {
    const [row] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row || !Number.isFinite(row.now.getTime())) throw new Error('Database clock unavailable');
    return row.now;
}

function claimWhere(id: string, attempts: number, now: Date) {
    return {
        id,
        attempts,
        processedAt: null,
        deadLetterAt: null,
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    };
}

/** The application is at-least-once: an SMTP ACK may be lost after acceptance.
 * Each retry uses the same Message-ID. No network call holds a database tx.
 */
export async function processContactEmailJob(id: string, now?: Date): Promise<Outcome> {
    if (!isMailEnabled()) return 'skipped';
    return withContactMailDatabaseScope(async () => {
        const clock = now ?? (await databaseNow());
        if (!Number.isFinite(clock.getTime())) throw new Error('Invalid worker clock');
        const job = await prisma.contactEmailJob.findUnique({ where: { id } });
        if (
            !job ||
            job.processedAt ||
            job.deadLetterAt ||
            job.nextAttemptAt > clock ||
            (job.leaseUntil && job.leaseUntil > clock)
        )
            return 'skipped';
        if (job.attempts >= MAX_CONTACT_EMAIL_ATTEMPTS) {
            const parked = await prisma.contactEmailJob.updateMany({
                where: claimWhere(id, job.attempts, clock),
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
        const claimed = await prisma.contactEmailJob.updateMany({
            where: claimWhere(id, job.attempts, clock),
            data: {
                leaseToken,
                leaseUntil: new Date(clock.getTime() + LEASE_MS),
                attempts: { increment: 1 },
            },
        });
        if (claimed.count !== 1) return 'skipped';

        let failureCode: 'SMTP_SEND_FAILED' | 'MESSAGE_MISSING' = 'MESSAGE_MISSING';
        try {
            // The worker RLS permits SELECT only for messages referenced by a job.
            const contact = await prisma.contactMessage.findUnique({
                where: { id: job.contactMessageId },
                select: {
                    name: true,
                    email: true,
                    phone: true,
                    city: true,
                    subject: true,
                    language: true,
                    message: true,
                    encryptedAt: true,
                },
            });
            if (!contact?.encryptedAt) throw new Error('Outbox message unavailable');
            const name = decryptSensitive(contact.name);
            const email = decryptSensitive(contact.email);
            const phone = decryptSensitive(contact.phone);
            const city = decryptSensitive(contact.city);
            const message = decryptSensitive(contact.message);
            if (!name || !email || !message || (contact.phone && !phone) || (contact.city && !city))
                throw new Error('Outbox message unavailable');
            failureCode = 'SMTP_SEND_FAILED';
            const messageId = `<spm-contact-${job.id}@spmnacional.org.br>`;
            const delivered =
                job.kind === 'NOTIFICATION'
                    ? await sendContactNotification(
                          {
                              name,
                              email,
                              phone,
                              city,
                              subject: contact.subject,
                              language: contact.language,
                              message,
                          },
                          messageId,
                      )
                    : await sendContactAcknowledgement({ name, email }, messageId);
            if (!delivered) throw new Error('SMTP did not confirm delivery');
            const completed = await prisma.contactEmailJob.updateMany({
                where: { id, leaseToken, processedAt: null, deadLetterAt: null },
                data: { processedAt: clock, leaseToken: null, leaseUntil: null, failureCode: null },
            });
            return completed.count === 1 ? 'sent' : 'skipped';
        } catch (error) {
            logError('contact.email_failed', error, { attempt: job.attempts + 1 });
            const delay = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 10));
            const changed = await prisma.contactEmailJob.updateMany({
                where: { id, leaseToken, processedAt: null, deadLetterAt: null },
                data: {
                    leaseToken: null,
                    leaseUntil: null,
                    nextAttemptAt: new Date(clock.getTime() + delay),
                    failureCode,
                    ...(job.attempts + 1 >= MAX_CONTACT_EMAIL_ATTEMPTS
                        ? { deadLetterAt: clock }
                        : {}),
                },
            });
            return changed.count === 1 ? 'failed' : 'skipped';
        }
    });
}

export interface ContactEmailBatchResult {
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
    deadLetters: number;
    smtpEnabled: boolean;
}

/** A bounded cron cycle, two SMTP calls at a time. Disabled SMTP never claims. */
export async function processPendingContactEmails(limit = 8): Promise<ContactEmailBatchResult> {
    const result: ContactEmailBatchResult = {
        sent: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        deadLetters: 0,
        smtpEnabled: isMailEnabled(),
    };
    return withContactMailDatabaseScope(async () => {
        if (result.smtpEnabled) {
            const bounded = Number.isFinite(limit)
                ? Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(limit)))
                : MAX_BATCH_SIZE;
            const clock = await databaseNow();
            const jobs = await prisma.contactEmailJob.findMany({
                where: {
                    processedAt: null,
                    deadLetterAt: null,
                    nextAttemptAt: { lte: clock },
                    OR: [{ leaseUntil: null }, { leaseUntil: { lte: clock } }],
                },
                orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
                select: { id: true },
                take: bounded,
            });
            const started = performance.now();
            for (
                let index = 0;
                index < jobs.length && performance.now() - started < BATCH_BUDGET_MS;
                index += 2
            ) {
                const outcomes = await Promise.all(
                    jobs.slice(index, index + 2).map((job) => processContactEmailJob(job.id)),
                );
                for (const outcome of outcomes) result[outcome] += 1;
            }
        }
        [result.pending, result.deadLetters] = await Promise.all([
            prisma.contactEmailJob.count({ where: { processedAt: null, deadLetterAt: null } }),
            prisma.contactEmailJob.count({
                where: { processedAt: null, deadLetterAt: { not: null } },
            }),
        ]);
        return result;
    });
}

/** Authenticated operator command after fixing SMTP/keys; no immediate delivery. */
export async function retryDeadLetterContactEmail(id: string): Promise<boolean> {
    if (!id || id.length > 256) return false;
    return withContactMailDatabaseScope(async () => {
        const clock = await databaseNow();
        const changed = await prisma.contactEmailJob.updateMany({
            where: {
                id,
                processedAt: null,
                deadLetterAt: { not: null },
                leaseToken: null,
                OR: [{ leaseUntil: null }, { leaseUntil: { lte: clock } }],
            },
            data: {
                deadLetterAt: null,
                failureCode: null,
                attempts: 0,
                nextAttemptAt: clock,
                leaseUntil: null,
            },
        });
        return changed.count === 1;
    });
}
