import type { Metadata } from 'next';
import { newsFilters, type AdminSearchParams } from '@/lib/admin-pagination';
import { listAdminNews } from '@/lib/server/admin-listing';
import { requirePermission } from '@/lib/server/auth';
import { formatDateLong } from '@/lib/labels';
import PageContent, { type CategoriaOpcao, type NoticiaLinha } from './PageContent';

// A listagem lê o Postgres a cada acesso — sem isto o build tentaria pré-renderizar.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Notícias | Painel SPM' },
};

export default async function Page({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
    await requirePermission('noticias');
    const filtros = newsFilters(await searchParams);
    const { posts, categorias, pagination, contagens } = await listAdminNews(filtros);

    // O cliente recebe tudo já formatado: nada de `Date` cru atravessando a fronteira.
    const linhas: NoticiaLinha[] = posts.map((post) => ({
        id: post.id,
        slug: post.slug,
        title: post.title,
        cover: post.coverUrl,
        categoryId: post.category.id,
        categoryName: post.category.name,
        author: post.authorName,
        date: formatDateLong(post.publishedAt),
        views: post.views,
        status: post.status,
        highlight: post.highlight,
    }));

    const opcoes: CategoriaOpcao[] = categorias;

    return (
        <PageContent
            noticias={linhas}
            categorias={opcoes}
            contagens={contagens}
            filtros={filtros}
            pagination={pagination}
        />
    );
}
