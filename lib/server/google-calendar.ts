import 'server-only';

import { AgendaSource } from '@/lib/generated/prisma/enums';
import { prisma } from './db';
import { env, isGoogleCalendarEnabled } from './env';

/**
 * Sincronização da agenda pública com o Google Calendar.
 *
 * Usa a API REST direta com chave (`key=`) em vez do SDK do Google: o
 * calendário da organização é público, e `events.list` aceita autorização
 * opcional nesse caso — não há token a renovar nem dependência a carregar.
 *
 * A função nunca lança. A agenda do site precisa continuar de pé mesmo com o
 * Google fora do ar, e ela já funciona sozinha com os eventos cadastrados no
 * painel (`source: MANUAL`), que esta rotina jamais toca.
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars';

/** Teto por chamada. Com `singleEvents=true` cada ocorrência conta como um item. */
const MAX_RESULTS = 50;

/** Duração assumida quando o Google devolve um evento sem fim declarado. */
const DURACAO_PADRAO_MS = 60 * 60 * 1000;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export interface AgendaSyncResult {
    criados: number;
    atualizados: number;
    removidos: number;
}

const NADA_A_FAZER: AgendaSyncResult = { criados: 0, atualizados: 0, removidos: 0 };

// ---------------------------------------------------------
// Formato da resposta do Google (só o que usamos)
// ---------------------------------------------------------

interface GoogleEventDate {
    /** Evento de dia inteiro: "2026-08-14". */
    date?: string;
    /** Evento com hora: RFC 3339 com offset. */
    dateTime?: string;
    timeZone?: string;
}

interface GoogleEvent {
    id?: string;
    status?: string;
    summary?: string;
    description?: string;
    location?: string;
    htmlLink?: string;
    start?: GoogleEventDate;
    end?: GoogleEventDate;
}

interface GoogleEventsResponse {
    items?: GoogleEvent[];
}

interface Intervalo {
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
}

/**
 * Converte o par start/end do Google em instantes gravaveis.
 *
 * Dia inteiro é ancorado em UTC porque `formatDateLong` (lib/labels) lê a data
 * com os getters UTC — assim o dia exibido é o mesmo que aparece no Google,
 * independentemente do fuso do servidor.
 */
function resolverIntervalo(event: GoogleEvent): Intervalo | null {
    const { start, end } = event;
    if (!start) return null;

    if (start.date) {
        const startsAt = new Date(`${start.date}T00:00:00.000Z`);
        if (Number.isNaN(startsAt.getTime())) return null;

        // O `end.date` do Google é exclusivo (o dia SEGUINTE ao último dia do
        // evento). Recuar 1 ms devolve o fim real, o que mantém o evento
        // visível no seu último dia tanto na listagem quanto na formatação.
        const bruto = end?.date ? new Date(`${end.date}T00:00:00.000Z`) : null;
        const endsAt =
            bruto && !Number.isNaN(bruto.getTime())
                ? new Date(bruto.getTime() - 1)
                : new Date(startsAt.getTime() + UM_DIA_MS - 1);

        return { startsAt, endsAt, allDay: true };
    }

    if (start.dateTime) {
        const startsAt = new Date(start.dateTime);
        if (Number.isNaN(startsAt.getTime())) return null;

        const bruto = end?.dateTime ? new Date(end.dateTime) : null;
        const endsAt =
            bruto && !Number.isNaN(bruto.getTime())
                ? bruto
                : new Date(startsAt.getTime() + DURACAO_PADRAO_MS);

        return { startsAt, endsAt, allDay: false };
    }

    return null;
}

function textoOuNulo(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

// ---------------------------------------------------------
// Sincronização
// ---------------------------------------------------------

/**
 * Traz os próximos eventos do calendário configurado e reflete-os na tabela
 * `AgendaEvent`. Devolve zeros — sem chamar nada — quando a integração não
 * está configurada ou quando algo falha.
 */
export async function sincronizarAgenda(): Promise<AgendaSyncResult> {
    if (!isGoogleCalendarEnabled()) return { ...NADA_A_FAZER };

    const calendarId = env.google.calendarId;
    const timeMin = new Date();

    try {
        const url = new URL(`${CALENDAR_API}/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set('key', env.google.calendarApiKey);
        url.searchParams.set('timeMin', timeMin.toISOString());
        // Expande séries recorrentes em ocorrências individuais; `orderBy=startTime`
        // só é aceito junto com essa opção.
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('orderBy', 'startTime');
        url.searchParams.set('maxResults', String(MAX_RESULTS));

        const response = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            console.error(
                `[agenda] Google Calendar respondeu ${response.status} para o calendário ${calendarId}.`,
            );
            return { ...NADA_A_FAZER };
        }

        const payload = (await response.json()) as GoogleEventsResponse;
        const items = payload.items ?? [];

        // Cada item vira um par (id, dados) já validado; o que não tiver id ou
        // data utilizável é descartado silenciosamente.
        const pendentes: { googleEventId: string; intervalo: Intervalo; event: GoogleEvent }[] = [];
        for (const event of items) {
            if (!event.id || event.status === 'cancelled') continue;
            const intervalo = resolverIntervalo(event);
            if (!intervalo) continue;
            pendentes.push({ googleEventId: event.id, intervalo, event });
        }

        const ids = pendentes.map((item) => item.googleEventId);

        // Saber de antemão o que já existe permite contar criação e atualização
        // sem depender do retorno do upsert.
        const existentes = ids.length
            ? await prisma.agendaEvent.findMany({
                  where: { googleEventId: { in: ids } },
                  select: { googleEventId: true },
              })
            : [];
        const jaExistem = new Set(
            existentes.map((row) => row.googleEventId).filter((id): id is string => Boolean(id)),
        );

        let criados = 0;
        let atualizados = 0;

        for (const { googleEventId, intervalo, event } of pendentes) {
            const dados = {
                calendarId,
                title: textoOuNulo(event.summary) ?? 'Evento sem título',
                description: textoOuNulo(event.description),
                location: textoOuNulo(event.location),
                url: textoOuNulo(event.htmlLink),
                startsAt: intervalo.startsAt,
                endsAt: intervalo.endsAt,
                allDay: intervalo.allDay,
                source: AgendaSource.GOOGLE_CALENDAR,
            };

            await prisma.agendaEvent.upsert({
                where: { googleEventId },
                // `published` fica de fora da atualização de propósito: se a
                // equipe escondeu um evento no painel, a sincronização não
                // pode trazê-lo de volta sozinha.
                update: dados,
                create: { ...dados, googleEventId, published: true },
            });

            if (jaExistem.has(googleEventId)) {
                atualizados += 1;
            } else {
                criados += 1;
            }
        }

        // Remoção do que sumiu do calendário.
        //
        // Só apagamos dentro da janela que a consulta realmente cobriu: nada
        // antes de `timeMin` (o passado não vem na resposta e é histórico) e,
        // se batemos no teto de resultados, nada depois do último evento
        // recebido — senão a página 2 do calendário seria apagada por engano.
        //
        // O teto é medido no que o Google devolveu (`items`), não no que sobrou
        // depois do filtro: um único evento cancelado na página faria
        // `pendentes` parecer incompleto e liberaria a exclusão de tudo o que
        // estava na página seguinte.
        const bateuNoTeto = items.length >= MAX_RESULTS;
        const horizonte = bateuNoTeto
            ? (pendentes[pendentes.length - 1]?.intervalo.startsAt ?? timeMin)
            : null;

        const { count: removidos } = await prisma.agendaEvent.deleteMany({
            where: {
                source: AgendaSource.GOOGLE_CALENDAR,
                endsAt: { gte: timeMin },
                ...(horizonte ? { startsAt: { lte: horizonte } } : {}),
                ...(ids.length ? { googleEventId: { notIn: ids } } : {}),
            },
        });

        return { criados, atualizados, removidos };
    } catch (error) {
        console.error('[agenda] falha ao sincronizar com o Google Calendar:', error);
        return { ...NADA_A_FAZER };
    }
}
