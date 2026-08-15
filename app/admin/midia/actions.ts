'use server';

import { revalidatePath } from 'next/cache';
import type { MediaKind } from '@/lib/generated/prisma/enums';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import { deleteFile, storeFile } from '@/lib/server/storage';
import {
    actionError,
    actionOk,
    formString,
    runAction,
    type ActionState,
} from '@/lib/server/actions';

/** Deriva o tipo da mídia pelo mimeType — o banco guarda a classificação já pronta. */
function kindFromMime(mimeType: string): MediaKind {
    if (mimeType.startsWith('image/')) return 'IMAGEM';
    if (
        mimeType === 'application/pdf' ||
        mimeType === 'application/zip' ||
        mimeType === 'application/msword' ||
        mimeType.startsWith('application/vnd.')
    ) {
        return 'DOCUMENTO';
    }
    return 'OUTRO';
}

export async function enviarArquivos(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('midia', async (user) => {
        // O formulário tem dois campos com o mesmo nome (topo e dropzone): o que
        // não foi usado chega como arquivo vazio.
        const arquivos = formData
            .getAll('arquivos')
            .filter((item): item is File => item instanceof File && item.size > 0);

        if (!arquivos.length) {
            return actionError('Escolha ao menos um arquivo para enviar.');
        }

        const enviados: string[] = [];
        const recusados: string[] = [];

        for (const arquivo of arquivos) {
            try {
                const guardado = await storeFile(arquivo, { prefix: 'biblioteca' });

                await prisma.media.create({
                    data: {
                        filename: guardado.filename,
                        originalName: arquivo.name,
                        mimeType: guardado.mimeType,
                        size: guardado.size,
                        kind: kindFromMime(guardado.mimeType),
                        url: guardado.url,
                        storageKey: guardado.storageKey,
                        uploadedById: user.id,
                    },
                });

                await recordAudit({
                    action: 'Arquivo enviado para a biblioteca',
                    target: arquivo.name,
                    userId: user.id,
                    actorLabel: user.email,
                    metadata: { tamanho: guardado.size, tipo: guardado.mimeType },
                });

                enviados.push(arquivo.name);
            } catch (error) {
                // Um arquivo recusado não pode derrubar os outros do mesmo envio.
                recusados.push(
                    `${arquivo.name} (${error instanceof Error ? error.message : 'falha no envio'})`,
                );
            }
        }

        revalidatePath('/admin/midia');
        revalidatePath('/admin/noticias/nova');

        if (!enviados.length) {
            return actionError(`Nenhum arquivo foi enviado: ${recusados.join('; ')}`);
        }

        const resumo =
            enviados.length === 1
                ? '1 arquivo adicionado à biblioteca.'
                : `${enviados.length} arquivos adicionados à biblioteca.`;

        return actionOk(recusados.length ? `${resumo} Recusados: ${recusados.join('; ')}` : resumo);
    });
}

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
