'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import { encryptSensitive } from '@/lib/server/crypto';
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
import { escopoMensagens, podeAtribuirMensagens } from './politica';

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

        const atual = await prisma.contactMessage.findFirst({
            where: { id, ...escopoMensagens(user) },
            select: {
                id: true,
                status: true,
                respondedAt: true,
                assignedToId: true,
                name: true,
                email: true,
                phone: true,
                city: true,
                message: true,
                encryptedAt: true,
            },
        });

        if (!atual) {
            return actionError('Mensagem não encontrada ou fora do seu escopo de atendimento.');
        }

        const podeAtribuir = podeAtribuirMensagens(user);
        if (!podeAtribuir && assignedToId !== user.id) {
            return actionError('Você não pode transferir esta mensagem para outra pessoa.', {
                assignedToId: 'A mensagem deve permanecer atribuída a você.',
            });
        }

        // Responsável só é aceito se a conta estiver ativa. A exceção é quem já
        // respondia pela mensagem antes de ser desativado: manter a atribuição
        // preserva o histórico de quem atendeu.
        let responsavel: { id: string; name: string } | null = podeAtribuir
            ? null
            : { id: user.id, name: user.name };
        if (podeAtribuir && assignedToId) {
            responsavel = await prisma.user.findFirst({
                where: {
                    id: assignedToId,
                    ...(assignedToId === atual.assignedToId
                        ? {}
                        : {
                              status: 'ATIVO',
                              role: {
                                  permissions: { some: { permissionKey: 'atendimentos' } },
                              },
                          }),
                },
                select: { id: true, name: true },
            });

            if (!responsavel) {
                return actionError('Verifique os campos destacados.', {
                    assignedToId: 'Selecione uma pessoa ativa com permissão de atendimento.',
                });
            }
        }

        // `respondedAt` é histórico: só é carimbado na primeira vez e é limpo se
        // a equipe desmarcar a mensagem como respondida.
        const respondedAt = marcarRespondida ? (atual.respondedAt ?? new Date()) : null;

        const atualizado = await prisma.contactMessage.updateMany({
            where: { id, ...escopoMensagens(user) },
            data: {
                status,
                assignedToId: responsavel?.id ?? null,
                internalNote: encryptSensitive(internalNote),
                respondedAt,
                // Qualquer atualização também converte uma linha legada por
                // completo, sem deixar uma mistura de texto claro e cifrado.
                ...(atual.encryptedAt
                    ? {}
                    : {
                          name: encryptSensitive(atual.name)!,
                          email: encryptSensitive(atual.email)!,
                          phone: encryptSensitive(atual.phone),
                          city: encryptSensitive(atual.city),
                          message: encryptSensitive(atual.message)!,
                          ip: null,
                          userAgent: null,
                          encryptedAt: new Date(),
                      }),
            },
        });

        if (atualizado.count !== 1) {
            return actionError(
                'A mensagem deixou de pertencer ao seu escopo. Recarregue a página.',
            );
        }

        await recordAudit({
            action:
                atual.status === status
                    ? 'Mensagem de contato atualizada'
                    : `Mensagem movida para "${CONTACT_STATUS_LABEL[status]}"`,
            target: `Mensagem ${id}`,
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

        const atual = await prisma.contactMessage.findFirst({
            where: { id, ...escopoMensagens(user) },
            select: { status: true, respondedAt: true },
        });

        if (!atual) {
            return actionError('Mensagem não encontrada ou fora do seu escopo de atendimento.');
        }

        const atualizado = await prisma.contactMessage.updateMany({
            where: { id, ...escopoMensagens(user) },
            data: {
                status,
                // Marcar como respondida pela listagem também carimba a data.
                respondedAt:
                    status === 'RESPONDIDA' ? (atual.respondedAt ?? new Date()) : atual.respondedAt,
            },
        });

        if (atualizado.count !== 1) {
            return actionError(
                'A mensagem deixou de pertencer ao seu escopo. Recarregue a página.',
            );
        }

        await recordAudit({
            action: `Mensagem movida para "${CONTACT_STATUS_LABEL[status]}"`,
            target: `Mensagem ${id}`,
            userId: user.id,
            actorLabel: user.email,
            metadata: { mensagemId: id, statusAnterior: atual.status, statusNovo: status },
        });

        revalidarMensagem(id);
        return actionOk();
    });
}
