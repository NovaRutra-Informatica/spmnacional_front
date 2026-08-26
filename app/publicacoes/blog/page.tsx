import type { Metadata } from 'next';
import { formatDateLong } from '@/lib/labels';
import { getFeaturedPost, listCategories, listPublishedPosts } from '@/lib/server/queries';
import PageContent, { type BlogPostCard } from './PageContent';

/** A imagem do build roda sem banco: sem isto o prerender quebraria. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Blog e Notícias' };

/** Notícia sem capa cadastrada continua com o mesmo visual da grade. */
const FALLBACK_COVER = '/assets/exemplo-migrantes.jpeg';

type PostRow = Awaited<ReturnType<typeof listPublishedPosts>>[number];

/** O cliente recebe só texto: nada de Date nem de objeto do Prisma. */
function toCard(post: PostRow): BlogPostCard {
    return {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        date: formatDateLong(post.publishedAt),
        category: post.category.name,
        cover: post.coverUrl ?? FALLBACK_COVER,
    };
}

export default async function BlogPage() {
    const [featuredRow, postRows, categories] = await Promise.all([
        getFeaturedPost(),
        listPublishedPosts(),
        listCategories(),
    ]);

    const featured = featuredRow ? toCard(featuredRow) : null;

    // O destaque já ocupa o topo da página; repeti-lo na grade seria ruído.
    const posts = postRows.filter((post) => post.slug !== featured?.slug).map(toCard);

    // Categoria sem nada publicado viraria um filtro morto: só entram as que têm conteúdo.
    const comConteudo = new Set(postRows.map((post) => post.category.name));
    const categoriasVisiveis = categories
        .map((category) => category.name)
        .filter((name) => comConteudo.has(name));

    return <PageContent featured={featured} posts={posts} categories={categoriasVisiveis} />;
}
