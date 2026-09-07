'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { PostStatus } from '@/lib/generated/prisma/enums';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import {
    actionError,
    actionOk,
    formBoolean,
    formDate,
    formList,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import { slugify } from './slug';

const noticiaSchema = z.object({
    title: z
        .string()
        .min(3, 'Informe um título com pelo menos 3 caracteres.')
        .max(180, 'Título muito longo.'),
    slug: z
        .string()
        .min(3, 'O endereço precisa de pelo menos 3 caracteres.')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens.'),
    excerpt: z
        .string()
        .min(20, 'Escreva um resumo — ele aparece nos cards do blog.')
        .max(400, 'O resumo deve ter no máximo 400 caracteres.'),
    content: z
        .string()
        .min(50, 'Escreva o texto da matéria (pelo menos 50 caracteres).')
        .max(100_000, 'O texto da matéria deve ter no máximo 100.000 caracteres.'),
    categoryId: z.string().min(1, 'Escolha uma categoria.'),
    status: z.enum(['RASCUNHO', 'REVISAO', 'AGENDADO', 'PUBLICADO']),
});

/**
 * Uma capa só pode apontar para um arquivo nosso ou para uma URL absoluta —
 * o campo é oculto no formulário, então nunca confiamos no que chega.
 */
const URL_DE_CAPA = /^(?:https?:\/\/|\/(?!\/))/;

/** Invalida o cache do painel e das telas públicas afetadas por uma notícia. */
function revalidarNoticias(slug?: string | null): void {
    revalidatePath('/admin/noticias');
    revalidatePath('/publicacoes');
    revalidatePath('/publicacoes/blog');
    revalidatePath('/');
    if (slug) {
        revalidatePath(`/publicacoes/blog/${slug}`);
    }
}

// ---------------------------------------------------------
// Editor (criação e edição)
// ---------------------------------------------------------

export async function salvarNoticia(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('noticias', async (user) => {
        const id = formString(formData, 'id');
        // "Publicar agora" e "Salvar rascunho" são o mesmo formulário: o botão
        // clicado envia a intenção e só ele pode forçar o status publicado.
        const publicarAgora = formString(formData, 'intencao') === 'publicar';

        const titulo = formString(formData, 'title');
        const parsed = noticiaSchema.safeParse({
            title: titulo,
            slug: slugify(formString(formData, 'slug') || titulo),
            excerpt: formString(formData, 'excerpt'),
            content: formString(formData, 'content'),
            categoryId: formString(formData, 'categoryId'),
            status: publicarAgora ? 'PUBLICADO' : formString(formData, 'status'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const dados = parsed.data;

        const categoria = await prisma.category.findUnique({
            where: { id: dados.categoryId },
            select: { id: true },
        });

        if (!categoria) {
            return actionError('Verifique os campos destacados.', {
                categoryId: 'Escolha uma categoria da lista.',
            });
        }

        const conflito = await prisma.post.findFirst({
            where: { slug: dados.slug, ...(id ? { NOT: { id } } : {}) },
            select: { id: true, title: true },
        });

        if (conflito) {
            return actionError('Este endereço já está em uso.', {
                slug: `Já existe a notícia “${conflito.title}” neste endereço. Escolha outro.`,
            });
        }

        const dataInformada = formDate(formData, 'publishedAt');
        if (dados.status === 'AGENDADO' && !dataInformada) {
            return actionError('Verifique os campos destacados.', {
                publishedAt: 'Escolha a data em que a notícia deve ir ao ar.',
            });
        }

        const publishedAt = dataInformada ?? (dados.status === 'PUBLICADO' ? new Date() : null);

        // A capa já foi enviada pela rota autenticada e limitada de uploads;
        // esta Server Action recebe somente o identificador leve da biblioteca.
        let coverMediaId: string | null = formString(formData, 'coverMediaId') || null;
        const urlInformada = formString(formData, 'coverUrl');
        let coverUrl: string | null = URL_DE_CAPA.test(urlInformada) ? urlInformada : null;

        if (coverMediaId) {
            const media = await prisma.media.findUnique({
                where: { id: coverMediaId },
                select: { url: true, kind: true },
            });

            if (media?.kind === 'IMAGEM') {
                coverUrl = media.url;
            } else {
                return actionError('Verifique os campos destacados.', {
                    cover: 'Escolha uma imagem válida da biblioteca.',
                });
            }
        }

        // ----- tags -----
        const nomesDeTag = Array.from(
            new Set(
                formList(formData, 'tags')
                    .map((nome) => nome.toLowerCase())
                    .filter((nome) => nome.length > 1),
            ),
        ).slice(0, 12);

        const tagIds: string[] = [];
        for (const nome of nomesDeTag) {
            const slugDaTag = slugify(nome);
            if (!slugDaTag) continue;

            const tag = await prisma.tag.upsert({
                where: { slug: slugDaTag },
                update: {},
                create: { slug: slugDaTag, name: nome },
                select: { id: true },
            });
            tagIds.push(tag.id);
        }

        const conteudo = {
            slug: dados.slug,
            title: dados.title,
            excerpt: dados.excerpt,
            content: dados.content,
            categoryId: dados.categoryId,
            status: dados.status as PostStatus,
            publishedAt,
            highlight: formBoolean(formData, 'highlight'),
            coverUrl,
            coverMediaId,
        };

        if (id) {
            const existente = await prisma.post.findUnique({
                where: { id },
                select: { id: true, slug: true },
            });

            if (!existente) {
                return actionError('Notícia não encontrada. Ela pode ter sido excluída.');
            }

            const salvo = await prisma.post.update({
                where: { id },
                // Substitui o conjunto de tags inteiro: é mais simples e barato
                // do que diferenciar quais entraram e quais saíram.
                data: {
                    ...conteudo,
                    tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) },
                },
                select: { id: true, slug: true, title: true },
            });

            await recordAudit({
                action: publicarAgora ? 'Notícia publicada' : 'Notícia alterada',
                target: salvo.title,
                userId: user.id,
                actorLabel: user.email,
                metadata: { id: salvo.id, slug: salvo.slug, status: conteudo.status },
            });

            // O endereço antigo continua em cache até ser invalidado.
            if (existente.slug !== salvo.slug) {
                revalidatePath(`/publicacoes/blog/${existente.slug}`);
            }
            revalidarNoticias(salvo.slug);
        } else {
            const salvo = await prisma.post.create({
                data: {
                    ...conteudo,
                    authorId: user.id,
                    authorName: user.name,
                    tags: { create: tagIds.map((tagId) => ({ tagId })) },
                },
                select: { id: true, slug: true, title: true },
            });

            await recordAudit({
                action: 'Notícia criada',
                target: salvo.title,
                userId: user.id,
                actorLabel: user.email,
                metadata: { id: salvo.id, slug: salvo.slug, status: conteudo.status },
            });

            revalidarNoticias(salvo.slug);
        }

        // `redirect` sinaliza por exceção (o `runAction` deixa passar); o retorno
        // seguinte nunca acontece, mas mantém o contrato de tipo da ação.
        redirect('/admin/noticias');
        return actionOk('Notícia salva.');
    });
}

// ---------------------------------------------------------
// Ações de linha da listagem
// ---------------------------------------------------------

export async function alternarDestaque(formData: FormData): Promise<void> {
    const user = await requirePermission('noticias');
    const id = formString(formData, 'id');
    if (!id) return;

    const post = await prisma.post.findUnique({
        where: { id },
        select: { id: true, title: true, slug: true, highlight: true },
    });
    if (!post) return;

    await prisma.post.update({ where: { id: post.id }, data: { highlight: !post.highlight } });

    await recordAudit({
        action: post.highlight ? 'Destaque removido da notícia' : 'Notícia destacada na home',
        target: post.title,
        userId: user.id,
        actorLabel: user.email,
        metadata: { id: post.id },
    });

    revalidarNoticias(post.slug);
}

export async function alternarPublicacao(formData: FormData): Promise<void> {
    const user = await requirePermission('noticias');
    const id = formString(formData, 'id');
    if (!id) return;

    const post = await prisma.post.findUnique({
        where: { id },
        select: { id: true, title: true, slug: true, status: true, publishedAt: true },
    });
    if (!post) return;

    const publicando = post.status !== 'PUBLICADO';

    await prisma.post.update({
        where: { id: post.id },
        data: {
            status: publicando ? 'PUBLICADO' : 'RASCUNHO',
            // Ao publicar sem data marcada, vale a hora do clique.
            publishedAt: publicando ? (post.publishedAt ?? new Date()) : post.publishedAt,
        },
    });

    await recordAudit({
        action: publicando ? 'Notícia publicada' : 'Notícia despublicada',
        target: post.title,
        userId: user.id,
        actorLabel: user.email,
        metadata: { id: post.id, slug: post.slug },
    });

    revalidarNoticias(post.slug);
}

export async function excluirNoticia(formData: FormData): Promise<void> {
    const user = await requirePermission('noticias');
    const id = formString(formData, 'id');
    if (!id) return;

    const post = await prisma.post.findUnique({
        where: { id },
        select: { id: true, title: true, slug: true },
    });
    if (!post) return;

    // A mídia da capa continua na biblioteca: ela pode estar em uso em outro lugar.
    await prisma.post.delete({ where: { id: post.id } });

    await recordAudit({
        action: 'Notícia excluída',
        target: post.title,
        level: 'ALERTA',
        userId: user.id,
        actorLabel: user.email,
        metadata: { id: post.id, slug: post.slug },
    });

    revalidarNoticias(post.slug);
}
