'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import { deleteFile } from '@/lib/server/storage';
import {
    actionError,
    actionOk,
    formString,
    runAction,
    type ActionState,
} from '@/lib/server/actions';

export async function excluirMidia(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('midia', async (user) => {
        const id = formString(formData, 'id');
        if (!id) {
            return actionError('Arquivo não informado.');
        }

        const media = await prisma.media.findUnique({
            where: { id },
            select: {
                id: true,
                originalName: true,
                storageKey: true,
                _count: {
                    select: { posts: true, editais: true, documentos: true, materiais: true },
                },
            },
        });

        if (!media) {
            return actionError('Arquivo não encontrado. Ele pode já ter sido removido.');
        }

        // Excluir um arquivo em uso deixaria capas e downloads quebrados no site.
        const usos: string[] = [];
        if (media._count.posts) usos.push(`${media._count.posts} notícia(s)`);
        if (media._count.editais) usos.push(`${media._count.editais} edital(is)`);
        if (media._count.documentos) usos.push(`${media._count.documentos} documento(s)`);
        if (media._count.materiais) usos.push(`${media._count.materiais} material(is) da Semana`);

        if (usos.length) {
            return actionError(
                `“${media.originalName}” não pode ser removido: está em uso em ${usos.join(', ')}. Troque o arquivo nesses registros antes de excluir.`,
            );
        }

        // O registro sai primeiro: se o armazenamento falhar depois, sobra um
        // arquivo órfão (inofensivo) em vez de uma linha apontando para o nada.
        await prisma.media.delete({ where: { id: media.id } });
        await deleteFile(media.storageKey);

        await recordAudit({
            action: 'Arquivo removido da biblioteca',
            target: media.originalName,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
            metadata: { id: media.id, storageKey: media.storageKey },
        });

        revalidatePath('/admin/midia');
        revalidatePath('/admin/noticias/nova');

        return actionOk(`“${media.originalName}” foi removido da biblioteca.`);
    });
}
