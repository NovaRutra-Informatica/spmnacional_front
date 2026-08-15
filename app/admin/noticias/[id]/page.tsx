import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { toDateInputValue } from '@/lib/labels';
import PageContent, { type NoticiaEditor } from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Editar notícia | Painel SPM' },
};

/** Iniciais da assinatura — a autoria pode ser uma equipe, não só a pessoa logada. */
function iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '—';
    const primeira = partes[0]?.[0] ?? '';
    const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
    return (primeira + ultima).toUpperCase();
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    await requirePermission('noticias');
    const { id } = await params;

    const [post, categorias, imagens] = await Promise.all([
        prisma.post.findUnique({
            where: { id },
            select: {
                id: true,
                title: true,
                slug: true,
                excerpt: true,
                content: true,
                categoryId: true,
                status: true,
                publishedAt: true,
                highlight: true,
                coverUrl: true,
                coverMediaId: true,
                authorName: true,
                tags: { select: { tag: { select: { name: true } } } },
            },
        }),
        prisma.category.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true } }),
        prisma.media.findMany({
            where: { kind: 'IMAGEM' },
            orderBy: { createdAt: 'desc' },
            take: 24,
            select: { id: true, url: true, originalName: true },
        }),
    ]);

    if (!post) {
        notFound();
    }

    const dados: NoticiaEditor = {
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        categoryId: post.categoryId,
        tags: post.tags.map((vinculo) => vinculo.tag.name).join(', '),
        publishedAt: toDateInputValue(post.publishedAt),
        status: post.status,
        highlight: post.highlight,
        coverUrl: post.coverUrl,
        coverMediaId: post.coverMediaId,
    };

    return (
        <PageContent
            post={dados}
            categorias={categorias}
            imagens={imagens}
            autor={{
                name: post.authorName,
                initials: iniciais(post.authorName),
                role: 'Assinatura exibida no site',
            }}
            dataPadrao={toDateInputValue(new Date())}
        />
    );
}
