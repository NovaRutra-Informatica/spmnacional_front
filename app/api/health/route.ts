import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';

/**
 * Sonda de saúde usada pelo HEALTHCHECK do contêiner e pelo balanceador.
 *
 * O `force-dynamic` é obrigatório: sem ele o Next tentaria pré-renderizar esta
 * rota durante o `docker build`, quando não existe banco algum para responder.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
    let database: 'ok' | 'erro' = 'erro';

    try {
        await prisma.$queryRaw`select 1`;
        database = 'ok';
    } catch (error) {
        console.error('[health] banco indisponível:', error);
    }

    const healthy = database === 'ok';

    return NextResponse.json(
        {
            status: healthy ? 'ok' : 'degradado',
            uptime: Math.round(process.uptime()),
            database,
        },
        {
            status: healthy ? 200 : 503,
            headers: { 'Cache-Control': 'no-store' },
        },
    );
}
