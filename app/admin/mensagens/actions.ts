'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import {
    actionError,
    actionOk,
    formBoolean,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import { CONTACT_STATUS_LABEL } from '@/lib/labels';

const STATUS_VALUES = ['NOVA', 'EM_ATENDIMENTO', 'RESPONDIDA', 'ARQUIVADA'] as const;

const atualizarSchema = z.object({
    id: z.string().min(1, 'Mensagem não identificada.'),
    status: z.enum(STATUS_VALUES, 'Selecione um status válido.'),
    assignedToId: z.string(),
    internalNote: z.string().max(4000, 'A nota interna deve ter no máximo 4000 caracteres.'),
});

/** Revalida as telas afetadas por uma alteração em mensagem. */
function revalidarMensagem(id: string): void {
    revalidatePath('/admin/mensagens');
    revalidatePath(`/admin/mensagens/${id}`);
    revalidatePath('/admin');
}

export async function salvarMensagem(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('atendimentos', async (user) => {
        const parsed = atualizarSchema.safeParse({
            id: formString(formData, 'id'),
            status: formString(formData, 'status'),
            assignedToId: formString(formData, 'assignedToId'),
            internalNote: formString(formData, 'internalNote'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const { id, status, assignedToId, internalNote } = parsed.data;
        const marcarRespondida = formBoolean(formData, 'marcarRespondida');

        const atual = await prisma.contactMessage.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                subject: true,
                status: true,
                respondedAt: true,
                assignedToId: true,
            },
        });

        if (!atual) {
            return actionError('Mensagem não encontrada — talvez tenha sido removida.');
        }

        // Responsável só é aceito se a conta estiver ativa. A exceção é quem já
        // respondia pela mensagem antes de ser desativado: manter a atribuição
        // preserva o histórico de quem atendeu.
        let responsavel: { id: string; name: string } | null = null;
        if (assignedToId) {
            responsavel = await prisma.user.findFirst({
                where: {
                    id: assignedToId,
                    ...(assignedToId === atual.assignedToId ? {} : { status: 'ATIVO' }),
                },
                select: { id: true, name: true },
            });

            if (!responsavel) {
                return actionError('Verifique os campos destacados.', {
                    assignedToId: 'Selecione uma pessoa com conta ativa.',
                });
            }
        }

        // `respondedAt` é histórico: só é carimbado na primeira vez e é limpo se
        // a equipe desmarcar a mensagem como respondida.
        const respondedAt = marcarRespondida ? (atual.respondedAt ?? new Date()) : null;

        await prisma.contactMessage.update({
            where: { id },
            data: {
                status,
                assignedToId: responsavel?.id ?? null,
                internalNote: internalNote || null,
                respondedAt,
            },
        });

        await recordAudit({
            action:
                atual.status === status
                    ? 'Mensagem de contato atualizada'
                    : `Mensagem movida para "${CONTACT_STATUS_LABEL[status]}"`,
            target: `${atual.subject} — ${atual.name}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: {
                mensagemId: id,
                statusAnterior: atual.status,
                statusNovo: status,
                responsavel: responsavel?.name ?? null,
                respondida: Boolean(respondedAt),
            },
        });

        revalidarMensagem(id);
        return actionOk('Mensagem atualizada.');
    });
}

/** Alteração rápida de status a partir da listagem. */
export async function definirStatusMensagem(formData: FormData): Promise<void> {
    await runAction('atendimentos', async (user) => {
        const id = formString(formData, 'id');
        const parsedStatus = z.enum(STATUS_VALUES).safeParse(formString(formData, 'status'));

        if (!id || !parsedStatus.success) {
            return actionError('Requisição inválida.');
        }

        const status = parsedStatus.data;

        const atual = await prisma.contactMessage.findUnique({
            where: { id },
            select: { name: true, subject: true, status: true, respondedAt: true },
        });

        if (!atual) {
            return actionError('Mensagem não encontrada.');
        }

        await prisma.contactMessage.update({
            where: { id },
            data: {
                status,
                // Marcar como respondida pela listagem também carimba a data.
                respondedAt:
                    status === 'RESPONDIDA' ? (atual.respondedAt ?? new Date()) : atual.respondedAt,
            },
        });

        await recordAudit({
            action: `Mensagem movida para "${CONTACT_STATUS_LABEL[status]}"`,
            target: `${atual.subject} — ${atual.name}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { mensagemId: id, statusAnterior: atual.status, statusNovo: status },
        });

        revalidarMensagem(id);
        return actionOk();
    });
}
