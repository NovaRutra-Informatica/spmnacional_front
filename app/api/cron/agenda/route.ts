import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/server/audit';
import { env } from '@/lib/server/env';
import { sincronizarAgenda } from '@/lib/server/google-calendar';

/**
 * Endpoint de sincronização da agenda, chamado pelo Cloud Scheduler.
 *
 * Aceita GET e POST porque o Scheduler é configurado com GET em ambientes
 * simples e com POST quando há corpo; nenhum dos dois recebe parâmetro.
 *
 * A rota é dinâmica: o build roda sem banco e sem segredo, então nada aqui
 * pode ser avaliado em tempo de compilação.
 */
export const dynamic = 'force-dynamic';

/** Comparação em tempo constante — evita distinguir segredos por latência. */
function segredoConfere(recebido: string, esperado: string): boolean {
    const a = Buffer.from(recebido);
    const b = Buffer.from(esperado);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

function autorizado(request: Request): boolean {
    const esperado = env.cronSecret;

    // Sem CRON_SECRET configurado a rota fica fechada. Um endpoint que dispara
    // escrita no banco não pode ficar aberto por omissão de configuração.
    if (!esperado) return false;

    const header = request.headers.get('authorization') ?? '';
    const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    const alternativo = request.headers.get('x-cron-secret')?.trim() ?? '';

    return (
        (bearer !== '' && segredoConfere(bearer, esperado)) ||
        (alternativo !== '' && segredoConfere(alternativo, esperado))
    );
}

async function executar(request: Request): Promise<NextResponse> {
    if (!autorizado(request)) {
        return NextResponse.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 });
    }

    const resultado = await sincronizarAgenda();

    // Auditoria só quando houve mudança: a rotina roda de seis em seis horas
    // (ver `agenda_sync_schedule` no terraform) e um registro por execução
    // vazia inutilizaria o log.
    if (resultado.criados || resultado.atualizados || resultado.removidos) {
        await recordAudit({
            action: 'Agenda sincronizada',
            target: 'Google Calendar',
            actorLabel: 'cron',
            metadata: { ...resultado },
        });
    }

    return NextResponse.json(
        { ok: true, ...resultado, sincronizadoEm: new Date().toISOString() },
        { headers: { 'Cache-Control': 'no-store' } },
    );
}

export async function GET(request: Request): Promise<NextResponse> {
    return executar(request);
}

export async function POST(request: Request): Promise<NextResponse> {
    return executar(request);
}
