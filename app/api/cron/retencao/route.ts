import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { executeDataRetention } from '@/lib/server/data-retention';
import { env } from '@/lib/server/env';

/**
 * Expurgo diário de dados pessoais. O Cloud Scheduler deve chamar somente
 * POST, com o mesmo segredo operacional usado pelos demais cron jobs.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function safeEqual(received: string, expected: string): boolean {
    const left = Buffer.from(received, 'utf8');
    const right = Buffer.from(expected, 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

function isAuthorized(request: Request): boolean {
    const expected = env.cronSecret;
    if (Buffer.byteLength(expected, 'utf8') < 32 || expected === 'dev-cron-secret') return false;

    const authorization = request.headers.get('authorization') ?? '';
    const bearer = authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7).trim()
        : '';
    const alternate = request.headers.get('x-cron-secret')?.trim() ?? '';

    return (
        (bearer !== '' && safeEqual(bearer, expected)) ||
        (alternate !== '' && safeEqual(alternate, expected))
    );
}

export async function POST(request: Request): Promise<NextResponse> {
    if (!isAuthorized(request)) {
        return NextResponse.json(
            { ok: false, error: 'Não autorizado.' },
            { status: 401, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    try {
        const result = await executeDataRetention();
        return NextResponse.json(
            { ok: true, ...result },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch {
        // O Scheduler recebe uma falha transitória e pode repetir a chamada.
        // Não incluímos exceção ou configuração na resposta nem no log.
        console.error('[retencao] falha ao executar a política de retenção');
        return NextResponse.json(
            { ok: false, error: 'Falha temporária na rotina de retenção.' },
            {
                status: 503,
                headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
            },
        );
    }
}
