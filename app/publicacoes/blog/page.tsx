import { pageMetadata } from '@/lib/seo';
import PublicTranslation from '@/components/PublicTranslation';
import { formatDateLong } from '@/lib/labels';
import {
    getFeaturedPost,
    countPublishedPosts,
    listPublishedCategories,
    listPublishedPosts,
} from '@/lib/server/queries';
import { PUBLIC_PAGE_SIZE, publicPageNumber, publicCategory } from '@/lib/i18n/pagination';
import PageContent, { type BlogPostCard } from './PageContent';

/** A imagem do build roda sem banco: sem isto o prerender quebraria. */
export const dynamic = 'force-dynamic';

export const metadata = pageMetadata('/publicacoes/blog');

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

export default async function BlogPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = process.env.NEXT_PUBLIC_STATIC_DEMO === 'true' ? {} : await searchParams;
    const activeCategory = publicCategory(params.category);
    const total = await countPublishedPosts(activeCategory);
    const pages = Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE));
    const page = Math.min(publicPageNumber(params.page), pages);
    const [featuredRow, postRows, categories] = await Promise.all([
        page === 1 && !activeCategory ? getFeaturedPost() : null,
        listPublishedPosts({
            take: PUBLIC_PAGE_SIZE,
            skip: (page - 1) * PUBLIC_PAGE_SIZE,
            categorySlug: activeCategory,
        }),
        listPublishedCategories(),
    ]);

    const featured = featuredRow ? toCard(featuredRow) : null;

    // O destaque já ocupa o topo da página; repeti-lo na grade seria ruído.
    const posts = postRows.filter((post) => post.slug !== featured?.slug).map(toCard);

    // Categoria sem nada publicado viraria um filtro morto: só entram as que têm conteúdo.
    return (
        <PublicTranslation pageKey="publicacoes/blog">
            {
                <PageContent
                    featured={featured}
                    posts={posts}
                    categories={categories}
                    activeCategory={activeCategory}
                    page={page}
                    pages={pages}
                />
            }
        </PublicTranslation>
    );
}
