import 'server-only';

import { randomUUID } from 'node:crypto';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from './db';
import { withRetentionDatabaseScope } from './database-scope';
import { encryptSensitive } from './crypto';

/** Prazo técnico atual; a organização deve validar a política antes da ativação. */
export const DATA_RETENTION_MONTHS = 24;

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 5;
const MAX_BATCHES = 10;

interface BatchOutcome {
    selected: number;
    changed: number;
}

interface BatchRun {
    changed: number;
    batches: number;
    continuationRequired: boolean;
}

export interface DataRetentionResult {
    policyMonths: number;
    cutoff: string;
    executedAt: string;
    batchSize: number;
    maxBatches: number;
    continuationRequired: boolean;
    processed: {
        contactMessagesDeleted: number;
        contactMessagesEncrypted: number;
        atendimentosAnonymized: number;
        atendimentoReferralsDeleted: number;
        atendimentoAuditReferencesScrubbed: number;
        rateLimitBucketsDeleted: number;
        sessionsDeleted: number;
        loginAttemptsDeleted: number;
        auditLogsAnonymized: number;
        inviteTokensCleared: number;
        resetTokensCleared: number;
        newsletterTokensCleared: number;
        staleNewsletterSubscribersDeleted: number;
        idempotencyRequestsDeleted: number;
        genericEmailJobsDeleted: number;
    };
    batches: Record<string, number>;
}

interface DataRetentionOptions {
    now?: Date;
    batchSize?: number;
    maxBatches?: number;
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(maximum, Math.max(1, Math.floor(value ?? fallback)));
}

/**
 * Subtrai meses no calendário UTC sem transformar 29 de fevereiro em março.
 * Isso mantém o prazo como 24 meses civis, não como uma aproximação em dias.
 */
function monthsBefore(date: Date, months: number): Date {
    const targetYear = date.getUTCFullYear();
    const targetMonth = date.getUTCMonth() - months;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return new Date(
        Date.UTC(
            targetYear,
            targetMonth,
            Math.min(date.getUTCDate(), lastDay),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds(),
        ),
    );
}

async function runInBatches(
    worker: (batchSize: number) => Promise<BatchOutcome>,
    batchSize: number,
    maxBatches: number,
): Promise<BatchRun> {
    let changed = 0;
    let batches = 0;

    for (let index = 0; index < maxBatches; index += 1) {
        const outcome = await worker(batchSize);
        if (outcome.selected === 0) {
            return { changed, batches, continuationRequired: false };
        }

        batches += 1;
        changed += outcome.changed;

        if (outcome.selected < batchSize) {
            return { changed, batches, continuationRequired: false };
        }
    }

    // O último lote cheio pode ter sido exatamente o fim da fila. Indicamos
    // continuação por segurança; outra chamada é idempotente e barata.
    return { changed, batches, continuationRequired: true };
}

function idsOf(rows: Array<{ id: string }>): string[] {
    return rows.map(({ id }) => id);
}

/**
 * Executa a política em lotes limitados. A migração de registros legados lê
 * conteúdo pessoal apenas no lote que será imediatamente cifrado.
 *
 * Chamadas simultâneas são seguras: toda escrita repete a condição de
 * vencimento/marcador, e deleteMany/updateMany contabilizam apenas o que a
 * própria execução efetivamente alterou.
 */
export async function executeDataRetention(
    options: DataRetentionOptions = {},
): Promise<DataRetentionResult> {
    return withRetentionDatabaseScope(() => executeScopedDataRetention(options));
}

async function executeScopedDataRetention(options: DataRetentionOptions): Promise<DataRetentionResult> {
    const now = options.now ? new Date(options.now) : new Date();
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid retention reference date.');

    const cutoff = monthsBefore(now, DATA_RETENTION_MONTHS);
    const batchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
    const maxBatches = boundedInteger(options.maxBatches, DEFAULT_MAX_BATCHES, MAX_BATCHES);

    let atendimentoReferralsDeleted = 0;
    let atendimentoAuditReferencesScrubbed = 0;
    const genericEmailJobs = await runInBatches(async (limit) => {
        const rows = await prisma.genericEmailJob.findMany({ where: { expiresAt: { lte: now } },
            orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }], take: limit, select: { id: true } });
        if (!rows.length) return { selected: 0, changed: 0 };
        const changed = await prisma.genericEmailJob.deleteMany({ where: {
            id: { in: idsOf(rows) }, expiresAt: { lte: now },
        } });
        return { selected: rows.length, changed: changed.count };
    }, batchSize, maxBatches);
    const idempotency = await runInBatches(async (limit) => {
        const rows = await prisma.idempotencyRequest.findMany({ where: { expiresAt: { lte: now } },
            orderBy: [{ expiresAt: 'asc' }, { keyHash: 'asc' }], take: limit, select: { keyHash: true } });
        if (!rows.length) return { selected: 0, changed: 0 };
        const changed = await prisma.idempotencyRequest.deleteMany({ where: {
            keyHash: { in: rows.map(row => row.keyHash) }, expiresAt: { lte: now },
        } });
        return { selected: rows.length, changed: changed.count };
    }, batchSize, maxBatches);

    const contactMessages = await runInBatches(
        async (limit) => {
            const rows = await prisma.contactMessage.findMany({
                where: { updatedAt: { lte: cutoff } },
                orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.contactMessage.deleteMany({
                where: { id: { in: idsOf(rows) }, updatedAt: { lte: cutoff } },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    // Registros anteriores a esta política são convertidos no próprio ciclo de
    // manutenção. Linhas novas já nascem cifradas no formulário público.
    const contactMessageEncryption = await runInBatches(
        async (limit) => {
            const rows = await prisma.contactMessage.findMany({
                where: { encryptedAt: null },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    city: true,
                    message: true,
                    internalNote: true,
                    updatedAt: true,
                },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const results = await prisma.$transaction(async (tx) => {
                const outcomes = [];
                for (const row of rows) {
                    outcomes.push(await tx.contactMessage.updateMany({
                        where: { id: row.id, encryptedAt: null, updatedAt: row.updatedAt },
                        data: {
                            name: encryptSensitive(row.name)!,
                            email: encryptSensitive(row.email)!,
                            phone: encryptSensitive(row.phone),
                            city: encryptSensitive(row.city),
                            message: encryptSensitive(row.message)!,
                            internalNote: encryptSensitive(row.internalNote),
                            ip: null,
                            userAgent: null,
                            encryptedAt: now,
                            // Migrar a cifra não renova o prazo de retenção nem
                            // sobrescreve uma edição feita após a seleção do lote.
                            updatedAt: row.updatedAt,
                        },
                    }));
                }
                return outcomes;
            });
            return {
                selected: rows.length,
                changed: results.reduce((sum, result) => sum + result.count, 0),
            };
        },
        batchSize,
        maxBatches,
    );

    const atendimentos = await runInBatches(
        async (limit) => {
            const rows = await prisma.atendimento.findMany({
                where: {
                    anonymizedAt: null,
                    OR: [{ retencaoAte: { lte: now } }, { updatedAt: { lte: cutoff } }],
                },
                orderBy: [{ retencaoAte: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true, codigo: true, encerradoEm: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const outcome = await prisma.$transaction(
                async (tx) => {
                    const changedRows: typeof rows = [];
                    for (const row of rows) {
                        const changed = await tx.atendimento.updateMany({
                            where: {
                                id: row.id,
                                anonymizedAt: null,
                                OR: [{ retencaoAte: { lte: now } }, { updatedAt: { lte: cutoff } }],
                            },
                            data: {
                                // O código anterior pode circular fora do sistema;
                                // trocá-lo rompe essa possibilidade de correlação.
                                codigo: `ANON-${randomUUID()}`,
                                nomeEncrypted: null,
                                contatoEncrypted: null,
                                faixaEtaria: 'NAO_INFORMADO',
                                genero: 'NAO_INFORMADO',
                                paisOrigem: null,
                                idiomas: [],
                                chegadaAno: null,
                                necessidades: [],
                                observacoes: null,
                                status: 'ENCERRADO',
                                encerradoEm: row.encerradoEm ?? now,
                                abertoPorId: null,
                                anonymizedAt: now,
                            },
                        });
                        if (changed.count > 0) changedRows.push(row);
                    }
                    // Só exclua vínculos de fichas que esta transação conseguiu
                    // anonimizar. Uma renovação concorrente deve preservar tudo.
                    if (changedRows.length === 0) return { changed: 0, referrals: 0, audit: 0 };
                    const referrals = await tx.atendimentoEncaminhamento.deleteMany({
                        where: { atendimentoId: { in: idsOf(changedRows) } },
                    });
                    const audit = await tx.auditLog.updateMany({
                        where: { target: { in: changedRows.map(({ codigo }) => codigo) } },
                        data: { target: 'atendimento anonimizado', metadata: Prisma.DbNull },
                    });
                    return {
                        changed: changedRows.length,
                        referrals: referrals.count,
                        audit: audit.count,
                    };
                },
                { timeout: 30_000, maxWait: 5_000 },
            );
            atendimentoReferralsDeleted += outcome.referrals;
            atendimentoAuditReferencesScrubbed += outcome.audit;
            return { selected: rows.length, changed: outcome.changed };
        },
        batchSize,
        maxBatches,
    );

    const rateLimitBuckets = await runInBatches(
        async (limit) => {
            const rows = await prisma.rateLimitBucket.findMany({
                where: { expiresAt: { lte: now } },
                orderBy: [{ expiresAt: 'asc' }, { key: 'asc' }],
                take: limit,
                select: { key: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.rateLimitBucket.deleteMany({
                where: {
                    key: { in: rows.map(({ key }) => key) },
                    expiresAt: { lte: now },
                },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    const sessions = await runInBatches(
        async (limit) => {
            const rows = await prisma.session.findMany({
                where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.session.deleteMany({
                where: {
                    id: { in: idsOf(rows) },
                    OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
                },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    const loginAttempts = await runInBatches(
        async (limit) => {
            const rows = await prisma.loginAttempt.findMany({
                where: { createdAt: { lte: cutoff } },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.loginAttempt.deleteMany({
                where: { id: { in: idsOf(rows) }, createdAt: { lte: cutoff } },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    const auditLogs = await runInBatches(
        async (limit) => {
            const rows = await prisma.auditLog.findMany({
                where: { createdAt: { lte: cutoff }, anonymizedAt: null },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.auditLog.updateMany({
                where: {
                    id: { in: idsOf(rows) },
                    createdAt: { lte: cutoff },
                    anonymizedAt: null,
                },
                data: {
                    userId: null,
                    actorLabel: 'identidade removida',
                    target: 'alvo removido',
                    ip: null,
                    userAgent: null,
                    metadata: Prisma.DbNull,
                    anonymizedAt: now,
                },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    const inviteTokens = await runInBatches(
        async (limit) => {
            const rows = await prisma.user.findMany({
                where: {
                    inviteTokenHash: { not: null },
                    OR: [{ inviteExpiresAt: { lte: now } }, { inviteExpiresAt: null }],
                },
                orderBy: [{ inviteExpiresAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.user.updateMany({
                where: {
                    id: { in: idsOf(rows) },
                    inviteTokenHash: { not: null },
                    OR: [{ inviteExpiresAt: { lte: now } }, { inviteExpiresAt: null }],
                },
                data: { inviteTokenHash: null, inviteExpiresAt: null },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    const resetTokens = await runInBatches(
        async (limit) => {
            const rows = await prisma.user.findMany({
                where: {
                    resetTokenHash: { not: null },
                    OR: [{ resetExpiresAt: { lte: now } }, { resetExpiresAt: null }],
                },
                orderBy: [{ resetExpiresAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.user.updateMany({
                where: {
                    id: { in: idsOf(rows) },
                    resetTokenHash: { not: null },
                    OR: [{ resetExpiresAt: { lte: now } }, { resetExpiresAt: null }],
                },
                data: { resetTokenHash: null, resetExpiresAt: null },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    const newsletterTokens = await runInBatches(
        async (limit) => {
            const rows = await prisma.newsletterSubscriber.findMany({
                where: {
                    confirmTokenHash: { not: null },
                    OR: [{ confirmExpiresAt: { lte: now } }, { confirmExpiresAt: null }],
                },
                orderBy: [{ confirmExpiresAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.newsletterSubscriber.updateMany({
                where: {
                    id: { in: idsOf(rows) },
                    confirmTokenHash: { not: null },
                    OR: [{ confirmExpiresAt: { lte: now } }, { confirmExpiresAt: null }],
                },
                data: { confirmTokenHash: null, confirmExpiresAt: null },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    const staleNewsletterSubscribers = await runInBatches(
        async (limit) => {
            const rows = await prisma.newsletterSubscriber.findMany({
                where: {
                    OR: [
                        { unsubscribedAt: { lte: cutoff } },
                        { confirmed: false, createdAt: { lte: cutoff } },
                    ],
                },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: limit,
                select: { id: true },
            });
            if (rows.length === 0) return { selected: 0, changed: 0 };

            const result = await prisma.newsletterSubscriber.deleteMany({
                where: {
                    id: { in: idsOf(rows) },
                    OR: [
                        { unsubscribedAt: { lte: cutoff } },
                        { confirmed: false, createdAt: { lte: cutoff } },
                    ],
                },
            });
            return { selected: rows.length, changed: result.count };
        },
        batchSize,
        maxBatches,
    );

    const runs = {
        genericEmailJobs,
        idempotency,
        contactMessages,
        contactMessageEncryption,
        atendimentos,
        rateLimitBuckets,
        sessions,
        loginAttempts,
        auditLogs,
        inviteTokens,
        resetTokens,
        newsletterTokens,
        staleNewsletterSubscribers,
    };

    const processed = {
        contactMessagesDeleted: contactMessages.changed,
        contactMessagesEncrypted: contactMessageEncryption.changed,
        atendimentosAnonymized: atendimentos.changed,
        atendimentoReferralsDeleted,
        atendimentoAuditReferencesScrubbed,
        rateLimitBucketsDeleted: rateLimitBuckets.changed,
        sessionsDeleted: sessions.changed,
        loginAttemptsDeleted: loginAttempts.changed,
        auditLogsAnonymized: auditLogs.changed,
        inviteTokensCleared: inviteTokens.changed,
        resetTokensCleared: resetTokens.changed,
        newsletterTokensCleared: newsletterTokens.changed,
        staleNewsletterSubscribersDeleted: staleNewsletterSubscribers.changed,
        idempotencyRequestsDeleted: idempotency.changed,
        genericEmailJobsDeleted: genericEmailJobs.changed,
    };

    const totalChanged = Object.values(processed).reduce((sum, count) => sum + count, 0);
    if (totalChanged > 0) {
        // Este evento contém apenas contagens agregadas. Não usamos
        // recordAudit aqui para não registrar o IP/UA do Cloud Scheduler.
        try {
            await prisma.auditLog.create({
                data: {
                    actorLabel: 'cron',
                    action: 'Política de retenção executada',
                    target: 'dados pessoais',
                    metadata: {
                        policyMonths: DATA_RETENTION_MONTHS,
                        processed,
                    },
                },
            });
        } catch {
            // O expurgo já ocorreu e não deve ser revertido por uma falha no
            // registro agregado. O alerta não inclui erro ou configuração.
            console.error('[retencao] não foi possível registrar o resumo agregado');
        }
    }

    return {
        policyMonths: DATA_RETENTION_MONTHS,
        cutoff: cutoff.toISOString(),
        executedAt: now.toISOString(),
        batchSize,
        maxBatches,
        continuationRequired: Object.values(runs).some((run) => run.continuationRequired),
        processed,
        batches: Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, run.batches])),
    };
}
