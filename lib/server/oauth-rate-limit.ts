import 'server-only';

import { NextResponse } from 'next/server';
import { requestMeta } from './audit';
import { logError } from './logger';
import { consumeRateLimit } from './rate-limit';

/** Admission control before cookies, token exchange or refusal audit writes. */
export async function googleOAuthRateLimitResponse(
    stage: 'start' | 'callback',
): Promise<NextResponse | null> {
    try {
        const { ip } = await requestMeta();
        const limits = [
            consumeRateLimit({
                scope: `google-oauth-${stage}-global`,
                identifier: 'all',
                limit: 300,
                windowMs: 15 * 60_000,
            }),
        ];
        if (ip) {
            limits.push(
                consumeRateLimit({
                    scope: `google-oauth-${stage}-source`,
                    identifier: ip,
                    limit: 30,
                    windowMs: 15 * 60_000,
                }),
            );
        }
        const denied = (await Promise.all(limits)).filter((result) => !result.allowed);
        if (!denied.length) return null;
        const retryAfter = Math.max(1, ...denied.map((result) => result.retryAfterSeconds));
        return NextResponse.json(
            { message: 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.' },
            {
                status: 429,
                headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) },
            },
        );
    } catch (error) {
        // A failed limiter cannot turn into unlimited outbound calls or audit writes.
        logError('auth.google_admission_unavailable', error);
        return NextResponse.json(
            {
                message:
                    'O acesso está temporariamente indisponível. Tente novamente em instantes.',
            },
            { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
        );
    }
}
