import 'server-only';

import { prisma } from './db';
import { hashToken } from './crypto';

interface RateLimitInput {
    scope: string;
    identifier: string;
    limit: number;
    windowMs: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
}

/**
 * Incrementa um contador no Postgres de forma atômica. Isso funciona mesmo
 * com várias instâncias do Cloud Run e não grava o identificador em claro.
 */
export async function consumeRateLimit({
    scope,
    identifier,
    limit,
    windowMs,
}: RateLimitInput): Promise<RateLimitResult> {
    const key = hashToken(`rate-limit:${scope}:${identifier}`);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowMs);

    const [bucket] = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
        INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt", "updatedAt")
        VALUES (${key}, 1, ${now}, ${expiresAt}, ${now})
        ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE
                WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1
                ELSE "RateLimitBucket"."count" + 1
            END,
            "windowStart" = CASE
                WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${now}
                ELSE "RateLimitBucket"."windowStart"
            END,
            "expiresAt" = CASE
                WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expiresAt}
                ELSE "RateLimitBucket"."expiresAt"
            END,
            "updatedAt" = ${now}
        RETURNING "count", "expiresAt"
    `;

    if (!bucket) {
        // Falhar fechado evita transformar uma indisponibilidade do limitador
        // em uma janela de envio ilimitado.
        return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
    }

    const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000),
    );

    return {
        allowed: bucket.count <= limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds,
    };
}
