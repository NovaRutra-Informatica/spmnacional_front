import 'server-only';

import { z } from 'zod';
import { AgendaSource } from '@/lib/generated/prisma/enums';
import { prisma } from './db';
import { env, isGoogleCalendarEnabled } from './env';
import { logError } from './logger';
import { readBoundedJson } from './bounded-json';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars';
const MAX_RESULTS = 50;
const MAX_PAGES = 10;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export interface AgendaSyncResult {
    ok: boolean;
    partial: boolean;
    criados: number;
    atualizados: number;
    removidos: number;
}

const EMPTY_RESULT = { partial: false, criados: 0, atualizados: 0, removidos: 0 };

const dateSchema = z.object({ date: z.string().optional(), dateTime: z.string().optional() });
const eventSchema = z.object({
    id: z.string().min(1).max(1024),
    status: z.string().optional(),
    summary: z.string().max(100_000).optional(),
    description: z.string().max(1_000_000).optional(),
    location: z.string().max(100_000).optional(),
    htmlLink: z.string().max(4096).optional(),
    start: dateSchema.optional(),
    end: dateSchema.optional(),
});
const responseSchema = z.object({
    kind: z.literal('calendar#events'),
    items: z.array(eventSchema).max(MAX_RESULTS).default([]),
    nextPageToken: z.string().min(1).max(4096).optional(),
});
type GoogleEvent = z.infer<typeof eventSchema>;

interface Intervalo {
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
}

function resolverIntervalo(event: GoogleEvent): Intervalo | null {
    if (!event.start) return null;
    const allDay = Boolean(event.start.date);
    const startValue = allDay ? event.start.date : event.start.dateTime;
    const endValue = allDay ? event.end?.date : event.end?.dateTime;
    const parse = (value: string) => {
        if (allDay && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        if (!allDay && !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
        const result = new Date(allDay ? `${value}T00:00:00.000Z` : value);
        if (!Number.isFinite(result.getTime())) return null;
        if (allDay && result.toISOString().slice(0, 10) !== value) return null;
        return result;
    };
    const startsAt = startValue ? parse(startValue) : null;
    if (!startsAt) return null;
    const parsedEnd = endValue ? parse(endValue) : null;
    if (endValue && !parsedEnd) return null;
    const exclusiveEnd =
        parsedEnd ?? new Date(startsAt.getTime() + (allDay ? UM_DIA_MS : 3_600_000));
    if (exclusiveEnd <= startsAt) return null;
    return {
        startsAt,
        endsAt: allDay ? new Date(exclusiveEnd.getTime() - 1) : exclusiveEnd,
        allDay,
    };
}

function textoOuNulo(value: string | undefined, maximum: number): string | null {
    return value?.trim().slice(0, maximum) || null;
}

function safeEventUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
        return null;
    }
}

/**
 * Lê páginas antes de escrever e aplica a alteração em uma transação. Uma
 * falha do provedor mantém o último retrato válido. `nextPageToken`, e não o
 * tamanho da página, determina se é seguro remover eventos ausentes.
 */
export async function sincronizarAgenda(): Promise<AgendaSyncResult> {
    if (!isGoogleCalendarEnabled()) return { ok: false, ...EMPTY_RESULT };
    const calendarId = env.google.calendarId;
    const timeMin = new Date();

    try {
        const url = new URL(`${CALENDAR_API}/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set('timeMin', timeMin.toISOString());
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('orderBy', 'startTime');
        url.searchParams.set('maxResults', String(MAX_RESULTS));
        const events = new Map<string, GoogleEvent>();
        const seenTokens = new Set<string>();
        let nextPageToken: string | undefined;
        const signal = AbortSignal.timeout(30_000);

        for (let page = 0; page < MAX_PAGES; page += 1) {
            if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);
            const response = await fetch(url, {
                // A chave fica fora da URL para não aparecer em logs de acesso.
                headers: { 'X-Goog-Api-Key': env.google.calendarApiKey },
                cache: 'no-store',
                redirect: 'error',
                signal,
            });
            if (!response.ok) throw new Error('Calendar upstream failure');
            const payload = responseSchema.parse(await readBoundedJson(response, 2 * 1024 * 1024));
            for (const event of payload.items) events.set(event.id, event);
            nextPageToken = payload.nextPageToken;
            if (!nextPageToken) break;
            if (seenTokens.has(nextPageToken)) throw new Error('Calendar pagination cycle');
            seenTokens.add(nextPageToken);
        }

        const pending = [...events.values()]
            .filter((event) => event.status !== 'cancelled')
            .map((event) => {
                const intervalo = resolverIntervalo(event);
                // Um item inesperado não pode transformar uma resposta defeituosa
                // em uma lista vazia e apagar dados válidos do banco.
                if (!intervalo) throw new Error('Invalid Calendar event dates');
                return { event, intervalo };
            });
        const ids = pending.map(({ event }) => event.id);
        const partial = Boolean(nextPageToken);

        return await prisma.$transaction(
            async (tx) => {
                const existing = ids.length
                    ? await tx.agendaEvent.findMany({
                          where: { googleEventId: { in: ids } },
                          select: { googleEventId: true, calendarId: true },
                      })
                    : [];
                if (existing.some((event) => event.calendarId !== calendarId)) {
                    throw new Error('Calendar event belongs to another calendar');
                }
                const knownIds = new Set(existing.map((event) => event.googleEventId));
                let criados = 0;
                let atualizados = 0;
                for (const { event, intervalo } of pending) {
                    const data = {
                        calendarId,
                        title: textoOuNulo(event.summary, 300) ?? 'Evento sem título',
                        description: textoOuNulo(event.description, 20_000),
                        location: textoOuNulo(event.location, 1000),
                        url: safeEventUrl(event.htmlLink),
                        ...intervalo,
                        source: AgendaSource.GOOGLE_CALENDAR,
                    };
                    await tx.agendaEvent.upsert({
                        where: { googleEventId: event.id },
                        update: data,
                        create: { ...data, googleEventId: event.id, published: true },
                    });
                    if (knownIds.has(event.id)) atualizados += 1;
                    else criados += 1;
                }
                // Recorrências infinitas podem exceder o orçamento. Numa consulta
                // incompleta nenhum evento ausente é excluído.
                const deleted = partial
                    ? { count: 0 }
                    : await tx.agendaEvent.deleteMany({
                          where: {
                              source: AgendaSource.GOOGLE_CALENDAR,
                              calendarId,
                              endsAt: { gte: timeMin },
                              ...(ids.length ? { googleEventId: { notIn: ids } } : {}),
                          },
                      });
                return { ok: true, partial, criados, atualizados, removidos: deleted.count };
            },
            { timeout: 30_000, maxWait: 5_000 },
        );
    } catch (error) {
        logError('calendar.sync_failed', error);
        return { ok: false, ...EMPTY_RESULT };
    }
}
