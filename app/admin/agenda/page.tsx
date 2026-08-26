import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { isGoogleCalendarEnabled } from '@/lib/server/env';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent, { type EventRow } from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Agenda | Painel SPM' },
};

/** Valor de `<input type="datetime-local">` no fuso do servidor. */
function toDateTimeInputValue(value: Date): string {
    const pad = (part: number) => String(part).padStart(2, '0');
    return [
        value.getFullYear(),
        '-',
        pad(value.getMonth() + 1),
        '-',
        pad(value.getDate()),
        'T',
        pad(value.getHours()),
        ':',
        pad(value.getMinutes()),
    ].join('');
}

export default async function Page() {
    await requirePermission('noticias');

    const rows = await prisma.agendaEvent.findMany({
        orderBy: { startsAt: 'desc' },
        take: 200,
        select: {
            id: true,
            title: true,
            description: true,
            location: true,
            url: true,
            startsAt: true,
            endsAt: true,
            allDay: true,
            source: true,
            published: true,
        },
    });

    const events: EventRow[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? '',
        location: row.location ?? '',
        url: row.url ?? '',
        startsAtInput: toDateTimeInputValue(row.startsAt),
        endsAtInput: toDateTimeInputValue(row.endsAt),
        startsAtLabel: formatDateTimeShort(row.startsAt),
        endsAtLabel: formatDateTimeShort(row.endsAt),
        allDay: row.allDay,
        source: row.source,
        published: row.published,
    }));

    // Contagens ficam no servidor: calcular "próximos" no cliente compararia com
    // um relógio diferente do usado na renderização e quebraria a hidratação.
    const agora = Date.now();
    const counts = {
        proximos: rows.filter((row) => row.published && row.endsAt.getTime() >= agora).length,
        google: rows.filter((row) => row.source === 'GOOGLE_CALENDAR').length,
        ocultos: rows.filter((row) => !row.published).length,
    };

    return (
        <PageContent
            events={events}
            counts={counts}
            calendarConfigured={isGoogleCalendarEnabled()}
        />
    );
}
