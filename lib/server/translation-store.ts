import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from './db';
import type { TranslationLocale } from '@/lib/i18n/config';

export function translationId(key: string, sourceHash: string, locale: TranslationLocale): string {
    return createHash('sha256')
        .update(JSON.stringify([key, sourceHash, locale]))
        .digest('hex');
}

export async function readTranslation(id: string): Promise<unknown> {
    return (
        await prisma.publicTranslation.findUnique({
            where: { id },
            select: { translatedFields: true },
        })
    )?.translatedFields;
}

/** Um único dono por versão/idioma, inclusive entre instâncias Cloud Run. */
export async function claimTranslation(input: {
    id: string;
    key: string;
    sourceHash: string;
    locale: TranslationLocale;
}): Promise<{ token: string; attempts: number } | null> {
    const token = randomUUID();
    // Abrange AMBAS as constraints únicas. ON CONFLICT(id) isoladamente pode
    // lançar conflito no índice composto sob inserções especulativas concorrentes.
    await prisma.$executeRaw`
        INSERT INTO "PublicTranslation"
            ("id", "contentKey", "sourceHash", "locale", "updatedAt")
        VALUES (${input.id}, ${input.key}, ${input.sourceHash}, ${input.locale}, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
    `;
    const [row] = await prisma.$queryRaw<Array<{ attempts: number }>>`
        UPDATE "PublicTranslation" SET
            "leaseToken" = ${token},
            "leaseUntil" = CURRENT_TIMESTAMP + INTERVAL '120 seconds',
            "attempts" = LEAST("PublicTranslation"."attempts", 10) + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.id} AND "PublicTranslation"."translatedFields" IS NULL
            AND ("PublicTranslation"."leaseUntil" IS NULL OR "PublicTranslation"."leaseUntil" <= CURRENT_TIMESTAMP)
            AND ("PublicTranslation"."retryAfter" IS NULL OR "PublicTranslation"."retryAfter" <= CURRENT_TIMESTAMP)
        RETURNING "attempts"
    `;
    return row ? { token, attempts: row.attempts } : null;
}

/**
 * O relógio e o limite são avaliados no PostgreSQL, sem read-modify-write.
 * Reserva antes da chamada externa e NÃO estorna timeouts/falhas (Google pode
 * ter processado a solicitação). Cobre esta aplicação, não outros consumidores GCP.
 */
export async function reserveTranslationCharacters(
    characters: number,
    limit: number,
): Promise<boolean> {
    if (
        !Number.isSafeInteger(characters) ||
        characters <= 0 ||
        !Number.isSafeInteger(limit) ||
        limit < characters ||
        limit > 10_000_000
    )
        return false;
    const [row] = await prisma.$queryRaw<Array<{ characters: number }>>`
        INSERT INTO "TranslationUsage" ("day", "characters", "updatedAt")
        VALUES (TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD'), ${characters}, CURRENT_TIMESTAMP)
        ON CONFLICT ("day") DO UPDATE SET
            "characters" = "TranslationUsage"."characters" + ${characters},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "TranslationUsage"."characters" <= ${limit - characters}
        RETURNING "characters"
    `;
    return Boolean(row);
}

export async function completeTranslation(
    id: string,
    token: string,
    fields: Record<string, string>,
): Promise<boolean> {
    const changed = await prisma.$executeRaw`
        UPDATE "PublicTranslation"
        SET "translatedFields" = ${JSON.stringify(fields)}::jsonb,
            "leaseToken" = NULL, "leaseUntil" = NULL, "retryAfter" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "leaseToken" = ${token} AND "leaseUntil" > CURRENT_TIMESTAMP
    `;
    return changed === 1;
}

/** Backoff persiste mesmo após reinício, sem repetir chamadas faturáveis em loop. */
export async function releaseTranslation(
    id: string,
    token: string,
    retrySeconds: number,
): Promise<void> {
    const seconds = Math.min(86_400, Math.max(60, Math.floor(retrySeconds)));
    await prisma.$executeRaw`
        UPDATE "PublicTranslation"
        SET "leaseToken" = NULL, "leaseUntil" = NULL,
            "retryAfter" = CURRENT_TIMESTAMP + ${seconds} * INTERVAL '1 second', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "leaseToken" = ${token}
    `;
}
