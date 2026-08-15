'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DocumentoCategoria } from '@/lib/generated/prisma/enums';
import {
    actionError,
    actionOk,
    formBoolean,
    formNumber,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import { recordAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';

/** Documentos são conteúdo editorial: mesma permissão das notícias. */
const PERMISSAO = 'noticias';

function revalidar(): void {
    revalidatePath('/admin/documentos');
    revalidatePath('/quem-somos/documentos');
}

const schema = z.object({
    title: z.string().min(3, 'Informe um título com pelo menos 3 caracteres.'),
    category: z.enum(DocumentoCategoria, 'Escolha uma categoria válida.'),
    meta: z
        .string()
        .min(3, 'Descreva o arquivo (ex.: PDF · 1,2 MB · atualizado em 2026).')
        .max(120, 'Use no máximo 120 caracteres na linha de metadados.'),
    icon: z
        .string()
        .regex(/^fa-[a-z0-9-]+$/, 'Use uma classe do Font Awesome, como "fa-file-pdf".'),
    fileUrl: z
        .string()
        .refine(
            (valor) => !valor || /^(https?:\/\/|\/)/.test(valor),
            'Informe um endereço http(s) ou um caminho começando por "/".',
        ),
    order: z
        .number('A ordem precisa ser um número.')
        .int('A ordem precisa ser um número inteiro.')
        .min(0, 'A ordem não pode ser negativa.')
        .max(999, 'A ordem máxima é 999.'),
});

/**
 * O arquivo pode vir da biblioteca ou de um endereço externo. Quando vem da
 * biblioteca, a URL é copiada para `fileUrl` — é o campo que o site lê.
 */
async function resolverArquivo(
    mediaId: string | null,
    fileUrl: string,
): Promise<{ ok: true; mediaId: string | null; fileUrl: string | null } | { ok: false }> {
    if (!mediaId) {
        return { ok: true, mediaId: null, fileUrl: fileUrl || null };
    }

    const media = await prisma.media.findUnique({ where: { id: mediaId }, select: { url: true } });
    if (!media) return { ok: false };

    return { ok: true, mediaId, fileUrl: media.url };
}

export async function salvarDocumento(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');

        const parsed = schema.safeParse({
            title: formString(formData, 'title'),
            category: formString(formData, 'category'),
            meta: formString(formData, 'meta'),
            icon: formString(formData, 'icon') || 'fa-file-lines',
            fileUrl: formString(formData, 'fileUrl'),
            order: formNumber(formData, 'order') ?? 0,
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const { fileUrl, ...dados } = parsed.data;

        const arquivo = await resolverArquivo(formString(formData, 'mediaId') || null, fileUrl);
        if (!arquivo.ok) {
            return actionError('O arquivo escolhido não existe mais na biblioteca.', {
                mediaId: 'Selecione outro arquivo.',
            });
        }

        const comum = {
            ...dados,
            published: formBoolean(formData, 'published'),
            mediaId: arquivo.mediaId,
            fileUrl: arquivo.fileUrl,
        };

        if (id) {
            const atual = await prisma.documento.findUnique({
                where: { id },
                select: { id: true },
            });

            if (!atual) {
                return actionError('Documento não encontrado. Atualize a página e tente de novo.');
            }

            const salvo = await prisma.documento.update({ where: { id }, data: comum });

            await recordAudit({
                action: 'Documento atualizado',
                target: salvo.title,
                userId: user.id,
                actorLabel: user.email,
                metadata: { categoria: salvo.category, published: salvo.published },
            });

            revalidar();
            return actionOk('Documento atualizado.', { id: salvo.id });
        }

        const criado = await prisma.documento.create({ data: comum });

        await recordAudit({
            action: 'Documento criado',
            target: criado.title,
            userId: user.id,
            actorLabel: user.email,
            metadata: { categoria: criado.category, published: criado.published },
        });

        revalidar();
        return actionOk('Documento criado.', { id: criado.id });
    });
}

export async function alternarPublicacaoDocumento(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const atual = await prisma.documento.findUnique({
            where: { id },
            select: { title: true, published: true },
        });

        if (!atual) {
            return actionError('Documento não encontrado. Atualize a página e tente de novo.');
        }

        const published = !atual.published;
        await prisma.documento.update({ where: { id }, data: { published } });

        await recordAudit({
            action: published ? 'Documento publicado' : 'Documento despublicado',
            target: atual.title,
            userId: user.id,
            actorLabel: user.email,
        });

        revalidar();
        return actionOk(
            published ? 'Documento publicado no site.' : 'Documento retirado do site.',
            {
                id,
            },
        );
    });
}

export async function excluirDocumento(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction(PERMISSAO, async (user) => {
        const id = formString(formData, 'id');
        const atual = await prisma.documento.findUnique({
            where: { id },
            select: { title: true },
        });

        if (!atual) {
            return actionError('Documento não encontrado. Atualize a página e tente de novo.');
        }

        await prisma.documento.delete({ where: { id } });

        await recordAudit({
            action: 'Documento excluído',
            target: atual.title,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });

        revalidar();
        return actionOk('Documento excluído. O arquivo continua na biblioteca de mídia.');
    });
}
