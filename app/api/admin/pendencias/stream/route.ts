import { getCurrentUser, hasPermission } from '@/lib/server/auth';
import { prisma, withActorDatabaseScope } from '@/lib/server/db';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { claimPendingStream, createPendingStream } from '@/lib/server/pending-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(request: Request): Promise<Response> {
    const origin = request.headers.get('origin');
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin))
        return new Response(null, { status: 403, headers: noStore });
    // Background streaming and reconnection must not extend the idle session.
    let user;
    try { user = await getCurrentUser({ touch: false }); }
    catch { return new Response(null, { status: 503, headers: { ...noStore, 'Retry-After': '10' } }); }
    if (!hasPermission(user, 'atendimentos') || !user)
        return new Response(null, { status: user ? 403 : 401, headers: noStore });
    let limit;
    try { limit = await consumeRateLimit({ scope: 'pending-stream', identifier: user.id, limit: 12, windowMs: 60_000 }); }
    catch { return new Response(null, { status: 503, headers: { ...noStore, 'Retry-After': '10' } }); }
    const release = limit.allowed ? claimPendingStream(user.id) : null;
    if (!release) return new Response(null, { status: 429, headers: { ...noStore, 'Retry-After': '10' } });
    const stream = createPendingStream({
        signal: request.signal,
        release,
        snapshot: async () => {
            const current = await getCurrentUser({ touch: false });
            if (!current || current.id !== user.id || !hasPermission(current, 'atendimentos')) return null;
            return withActorDatabaseScope(current, async () => {
                // RLS checks role/status/regional/assignment again for both counts.
                const [messages, cases] = await Promise.all([
                    prisma.contactMessage.count({ where: { status: 'NOVA' } }),
                    prisma.atendimento.count({ where: { status: { not: 'ENCERRADO' } } }),
                ]);
                return { messages, cases };
            });
        },
    });
    return new Response(stream, { headers: {
        ...noStore, 'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
    } });
}
