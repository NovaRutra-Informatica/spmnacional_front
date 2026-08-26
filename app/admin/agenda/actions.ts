'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import {
    actionError,
    actionOk,
    formBoolean,
    formDate,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import { isGoogleCalendarEnabled } from '@/lib/server/env';
import { sincronizarAgenda } from '@/lib/server/google-calendar';
import { formatDateTimeShort } from '@/lib/labels';

/**
 * Agenda institucional.
 *
 * Eventos vindos do Google Calendar são somente leitura: a próxima
 * sincronização sobrescreveria qualquer edição feita aqui. O único campo que a
 * equipe controla neles é a visibilidade no site.
 */

const eventoSchema = z.object({
    title: z.string().min(3, 'Informe um título com pelo menos 3 caracteres.'),
    description: z.string().max(2000, 'A descrição deve ter no máximo 2000 caracteres.'),
    location: z.string().max(240, 'O local deve ter no máximo 240 caracteres.'),
    url: z
        .string()
        .refine(
            (value) => !value || value.startsWith('/') || /^https?:\/\//i.test(value),
            'Informe um caminho começando com "/" ou um endereço http(s).',
        ),
});

function revalidarAgenda(): void {
    revalidatePath('/admin/agenda');
    revalidatePath('/agenda');
    revalidatePath('/');
}

export async function salvarEvento(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('noticias', async (user) => {
        const parsed = eventoSchema.safeParse({
            title: formString(formData, 'title'),
            description: formString(formData, 'description'),
            location: formString(formData, 'location'),
            url: formString(formData, 'url'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const startsAt = formDate(formData, 'startsAt');
        const endsAt = formDate(formData, 'endsAt');

        if (!startsAt) {
            return actionError('Verifique os campos destacados.', {
                startsAt: 'Informe a data e a hora de início.',
            });
        }

        if (!endsAt) {
            return actionError('Verifique os campos destacados.', {
                endsAt: 'Informe a data e a hora de término.',
            });
        }

        if (endsAt.getTime() < startsAt.getTime()) {
            return actionError('Verifique os campos destacados.', {
                endsAt: 'O término não pode ser anterior ao início.',
            });
        }

        const id = formString(formData, 'id');

        const data = {
            title: parsed.data.title,
            description: parsed.data.description || null,
            location: parsed.data.location || null,
            url: parsed.data.url || null,
            startsAt,
            endsAt,
            allDay: formBoolean(formData, 'allDay'),
            published: formBoolean(formData, 'published'),
        };

        if (id) {
            const atual = await prisma.agendaEvent.findUnique({
                where: { id },
                select: { id: true, title: true, source: true },
            });

            if (!atual) {
                return actionError('Evento não encontrado.');
            }

            if (atual.source === 'GOOGLE_CALENDAR') {
                return actionError(
                    'Este evento vem do Google Calendar e não pode ser editado aqui. Altere-o no calendário de origem ou apenas oculte-o do site.',
                );
            }

            await prisma.agendaEvent.update({ where: { id }, data });

            await recordAudit({
                action: 'Evento da agenda alterado',
                target: `${data.title} — ${formatDateTimeShort(startsAt)}`,
                userId: user.id,
                actorLabel: user.email,
                metadata: { eventoId: id, publicado: data.published },
            });

            revalidarAgenda();
            return actionOk('Evento salvo.', { id });
        }

        const saved = await prisma.agendaEvent.create({ data: { ...data, source: 'MANUAL' } });

        await recordAudit({
            action: 'Evento da agenda criado',
            target: `${saved.title} — ${formatDateTimeShort(saved.startsAt)}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { eventoId: saved.id, publicado: saved.published },
        });

        revalidarAgenda();
        return actionOk('Evento criado.', { id: saved.id });
    });
}

/** Liga e desliga a exibição no site — único ajuste permitido em evento do Google. */
export async function alternarVisibilidade(formData: FormData): Promise<void> {
    await runAction('noticias', async (user) => {
        const id = formString(formData, 'id');

        const atual = await prisma.agendaEvent.findUnique({
            where: { id },
            select: { title: true, published: true, startsAt: true },
        });

        if (!atual) {
            return actionError('Evento não encontrado.');
        }

        const published = !atual.published;
        await prisma.agendaEvent.update({ where: { id }, data: { published } });

        await recordAudit({
            action: published ? 'Evento da agenda publicado' : 'Evento da agenda ocultado',
            target: `${atual.title} — ${formatDateTimeShort(atual.startsAt)}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { eventoId: id, publicado: published },
        });

        revalidarAgenda();
        return actionOk();
    });
}

/**
 * Sincronização sob demanda com o Google Calendar.
 *
 * A rotina normal é o Cloud Scheduler batendo em `/api/cron/agenda` de seis em
 * seis horas; este botão existe para quem acabou de mexer no calendário e não
 * quer esperar a próxima janela. `sincronizarAgenda` nunca lança — devolve
 * zeros quando a integração está desligada ou quando o Google não responde.
 */
export async function sincronizarAgora(): Promise<void> {
    await runAction('noticias', async (user) => {
        if (!isGoogleCalendarEnabled()) {
            return actionError('Integração com o Google Calendar não configurada neste servidor.');
        }

        const resultado = await sincronizarAgenda();

        await recordAudit({
            action: 'Agenda sincronizada',
            target: 'Google Calendar',
            userId: user.id,
            actorLabel: user.email,
            metadata: { ...resultado, origem: 'painel' },
        });

        revalidarAgenda();
        return actionOk();
    });
}

export async function excluirEvento(formData: FormData): Promise<void> {
    await runAction('noticias', async (user) => {
        const id = formString(formData, 'id');

        const atual = await prisma.agendaEvent.findUnique({
            where: { id },
            select: { title: true, source: true, startsAt: true },
        });

        if (!atual) {
            return actionError('Evento não encontrado.');
        }

        // Excluir um evento sincronizado só o faria voltar na próxima sincronização.
        if (atual.source === 'GOOGLE_CALENDAR') {
            return actionError('Evento sincronizado do Google Calendar não pode ser excluído.');
        }

        await prisma.agendaEvent.delete({ where: { id } });

        await recordAudit({
            action: 'Evento da agenda excluído',
            target: `${atual.title} — ${formatDateTimeShort(atual.startsAt)}`,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });

        revalidarAgenda();
        return actionOk('Evento excluído.');
    });
}
