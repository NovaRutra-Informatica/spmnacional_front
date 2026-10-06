import { NextResponse } from 'next/server';
import { databaseReady, DATABASE_PROTOCOL } from '@/lib/server/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET() {
    const healthy = await databaseReady();
    return NextResponse.json(
        { status: healthy ? 'ok' : 'indisponivel', databaseProtocol: DATABASE_PROTOCOL },
        {
            status: healthy ? 200 : 503,
            headers: { 'Cache-Control': 'no-store', ...(healthy ? {} : { 'Retry-After': '10' }) },
        },
    );
}
