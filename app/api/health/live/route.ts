import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export function GET() {
    // Liveness não consulta o banco: uma falha externa não deve reiniciar todas as instâncias.
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
