import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/server/env';
import { processPendingNotificationEmails } from '@/lib/server/generic-email-outbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;
const noStore = { 'Cache-Control': 'no-store' };

function authorized(request: Request): boolean {
    const expected = env.cronSecret;
    if (Buffer.byteLength(expected, 'utf8') < 32 || expected === 'dev-cron-secret') return false;
    const authorization = request.headers.get('authorization') ?? '';
    const bearer = authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7).trim()
        : '';
    const received = [bearer, request.headers.get('x-cron-secret')?.trim() ?? ''];
    const right = Buffer.from(expected, 'utf8');
    return received.some((value) => {
        const left = Buffer.from(value, 'utf8');
        return left.length === right.length && timingSafeEqual(left, right);
    });
}

/** Durable email is independent from retention and its operational retries. */
export async function POST(request: Request): Promise<NextResponse> {
    if (!authorized(request))
        return NextResponse.json(
            { ok: false, error: 'Não autorizado.' },
            { status: 401, headers: noStore },
        );
    try {
        const result = await processPendingNotificationEmails();
        if (result.failed > 0 || result.deadLetters > 0) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Há notificações pendentes de nova tentativa ou revisão operacional.',
                    ...result,
                },
                { status: 503, headers: { ...noStore, 'Retry-After': '60' } },
            );
        }
        return NextResponse.json({ ok: true, ...result }, { headers: noStore });
    } catch {
        return NextResponse.json(
            { ok: false, error: 'Falha temporária na rotina de notificações.' },
            { status: 503, headers: { ...noStore, 'Retry-After': '60' } },
        );
    }
}
