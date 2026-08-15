import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent, { type CategoriaOpcao, type NoticiaLinha } from './PageContent';

// A listagem lê o Postgres a cada acesso — sem isto o build tentaria pré-renderizar.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Notícias | Painel SPM' },
};

export default async function Page() {
    await requirePermission('noticias');

    const [posts, categorias] = await Promise.all([
        prisma.post.findMany({
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                slug: true,
                title: true,
                coverUrl: true,
                status: true,
                publishedAt: true,
                highlight: true,
                views: true,
                authorName: true,
                category: { select: { id: true, name: true } },
                tags: { select: { tag: { select: { name: true } } } },
            },
        }),
        prisma.category.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true } }),
    ]);

    // O cliente recebe tudo já formatado: nada de `Date` cru atravessando a fronteira.
    const linhas: NoticiaLinha[] = posts.map((post) => ({
        id: post.id,
        slug: post.slug,
        title: post.title,
        cover: post.coverUrl,
        categoryId: post.category.id,
        categoryName: post.category.name,
        author: post.authorName,
        date: post.publishedAt ? formatDateTimeShort(post.publishedAt) : '—',
        views: post.views,
        status: post.status,
        highlight: post.highlight,
        tags: post.tags.map((vinculo) => vinculo.tag.name),
    }));

    const opcoes: CategoriaOpcao[] = categorias;

    return (
        <PageContent
            noticias={linhas}
            categorias={opcoes}
            contagens={{
                publicadas: linhas.filter((item) => item.status === 'PUBLICADO').length,
                rascunhos: linhas.filter((item) => item.status === 'RASCUNHO').length,
                revisao: linhas.filter((item) => item.status === 'REVISAO').length,
                agendadas: linhas.filter((item) => item.status === 'AGENDADO').length,
            }}
        />
    );
}
