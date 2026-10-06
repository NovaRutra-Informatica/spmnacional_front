import * as React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const queries = vi.hoisted(() => ({ post: vi.fn(), increment: vi.fn(), related: vi.fn() }));
vi.mock('@/lib/server/queries', () => ({
    getPostBySlug: queries.post,
    incrementPostViews: queries.increment,
    listRelatedPublishedPostLinks: queries.related,
}));
vi.mock('next/navigation', () => ({
    notFound: () => {
        throw new Error('NOT_FOUND');
    },
}));

import ArticlePage, { generateMetadata } from '@/app/publicacoes/blog/[slug]/page';

const post = {
    id: 'synthetic-article',
    slug: 'synthetic-article',
    title: 'Synthetic article',
    excerpt: 'Public excerpt',
    content: 'Public Markdown body.',
    authorName: 'Public signature',
    coverUrl: null,
    publishedAt: new Date('2000-01-01T00:00:00Z'),
    category: { name: 'Public category' },
    tags: [{ tag: { name: 'Public tag', slug: 'public-tag' } }],
};
const params = () => Promise.resolve({ slug: post.slug });
beforeAll(() => {
    vi.stubGlobal('React', React);
});
beforeEach(() => {
    vi.clearAllMocks();
    queries.post.mockResolvedValue(post);
    queries.increment.mockResolvedValue(undefined);
    queries.related.mockResolvedValue([]);
});

describe('leitura de artigo público', () => {
    it('começa a buscar links enquanto o contador ainda está pendente e aguarda ambos', async () => {
        let resolveCounter!: () => void;
        let resolveRelated!: (links: Array<{ slug: string; title: string }>) => void;
        const counter = new Promise<void>((resolve) => {
            resolveCounter = resolve;
        });
        const related = new Promise<Array<{ slug: string; title: string }>>((resolve) => {
            resolveRelated = resolve;
        });
        queries.increment.mockReturnValue(counter);
        queries.related.mockReturnValue(related);
        let finished = false;
        const rendering = ArticlePage({ params: params() }).then((tree) => {
            finished = true;
            return tree;
        });
        try {
            await vi.waitFor(
                () => {
                    expect(queries.increment).toHaveBeenCalledExactlyOnceWith(post.id);
                    expect(queries.related).toHaveBeenCalledExactlyOnceWith(post.slug);
                },
                { timeout: 1000 },
            );
            expect(finished).toBe(false);
            resolveCounter();
            await Promise.resolve();
            expect(finished).toBe(false);
            resolveRelated([{ slug: 'other-article', title: 'Another public article' }]);
            expect(await rendering).toBeTruthy();
            expect(finished).toBe(true);
        } finally {
            resolveCounter();
            resolveRelated([]);
            await rendering;
        }
    });

    it('não conta nem busca sugestões quando o artigo não está publicado ou não existe', async () => {
        queries.post.mockResolvedValue(null);
        await expect(ArticlePage({ params: params() })).rejects.toThrow('NOT_FOUND');
        expect(queries.increment).not.toHaveBeenCalled();
        expect(queries.related).not.toHaveBeenCalled();
    });

    it('gera metadata com a assinatura pública sem alterar contagem ou buscar sugestões', async () => {
        const metadata = await generateMetadata({ params: params() });
        expect(metadata.openGraph).toMatchObject({ title: post.title, description: post.excerpt });
        expect(queries.increment).not.toHaveBeenCalled();
        expect(queries.related).not.toHaveBeenCalled();
    });
});
