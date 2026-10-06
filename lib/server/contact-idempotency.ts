import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { hashToken } from './crypto';

export const CONTACT_ATTEMPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

/** Client keys identify a retry, never a message row or an authorization scope. */
export function contactAttemptKeyHash(key: string): string | null {
    return UUID_V4.test(key) ? hashToken(`contact-attempt:v1:${key.toLowerCase()}`) : null;
}

/** Validated input only; the database stores the HMAC, never this serialization. */
export function contactPayloadHash(input: {
    name: string;
    email: string;
    phone: string;
    city: string;
    subject: string;
    language: string;
    message: string;
}): string {
    return hashToken(
        `contact-payload:v1:${JSON.stringify([
            input.name,
            input.email.toLowerCase(),
            input.phone,
            input.city,
            input.subject,
            input.language,
            input.message,
        ])}`,
    );
}

export function contactReplayStatus(
    existing: { payloadHash: string; expiresAt: Date },
    payloadHash: string,
    now = new Date(),
): 'replay' | 'conflict' | 'expired' {
    if (!Number.isFinite(existing.expiresAt.getTime()) || existing.expiresAt <= now)
        return 'expired';
    if (!HASH.test(existing.payloadHash) || !HASH.test(payloadHash)) return 'conflict';
    return timingSafeEqual(
        Buffer.from(existing.payloadHash, 'hex'),
        Buffer.from(payloadHash, 'hex'),
    )
        ? 'replay'
        : 'conflict';
}

export function isIdempotencyClaimConflict(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}
