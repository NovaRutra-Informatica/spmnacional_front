import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    permission: vi.fn(),
    posts: vi.fn(),
    media: vi.fn(),
    groups: vi.fn(),
    categories: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({ requirePermission: mocks.permission }));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        post: { findMany: mocks.posts, groupBy: mocks.groups, count: async () => 26 },
        category: { findMany: mocks.categories },
        media: {
            findMany: mocks.media,
            groupBy: async () => [{ kind: 'IMAGEM', _count: { _all: 53 } }],
            count: async () => 26,
        },
    },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/admin/noticias/actions', () => ({
    alternarDestaque: async () => undefined,
    alternarPublicacao: async () => undefined,
    excluirNoticia: async () => undefined,
}));
vi.mock('@/app/admin/midia/actions', () => ({ excluirMidia: async () => ({ ok: true }) }));

beforeAll(() => vi.stubGlobal('React', React));
beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: 'synthetic-actor' });
    mocks.groups.mockResolvedValue([{ status: 'PUBLICADO', _count: { _all: 53 } }]);
    mocks.categories.mockResolvedValue([{ id: 'category-1', name: 'Categoria sintética' }]);
    mocks.posts.mockImplementation(async ({ take, skip }) =>
        Array.from({ length: Math.min(take, 53 - skip) }, (_, offset) => ({
            id: `post-${skip + offset}`,
            slug: `post-${skip + offset}`,
            title: `Notícia sintética ${skip + offset}`,
            coverUrl: null,
            status: 'PUBLICADO',
            publishedAt: null,
            highlight: false,
            views: 0,
            authorName: 'Equipe sintética',
            category: { id: 'category-1', name: 'Categoria sintética' },
        })),
    );
    mocks.media.mockImplementation(async ({ take, skip }) =>
        Array.from({ length: Math.min(take, 53 - skip) }, (_, offset) => ({
            id: `media-${skip + offset}`,
            originalName: `synthetic-${skip + offset}.png`,
            url: `/uploads/synthetic-${skip + offset}.png`,
            kind: 'IMAGEM',
            size: 10,
            createdAt: new Date('2026-01-01T12:00:00Z'),
            _count: { posts: 1, editais: 0, documentos: 0, materiais: 0 },
        })),
    );
});

describe('server-paginated admin pages', () => {
    it('sends and renders only 25 news rows while exposing all pages and global totals', async () => {
        const { default: Page } = await import('@/app/admin/noticias/page');
        const tree = await Page({ searchParams: Promise.resolve({ page: '2' }) });
        expect(mocks.permission).toHaveBeenCalledWith('noticias');
        expect(tree.props.noticias).toHaveLength(25);
        expect(tree.props.noticias[0].id).toBe('post-25');
        expect(tree.props.contagens.publicadas).toBe(53);
        expect(JSON.stringify(tree.props)).not.toContain('Notícia sintética 0');
        const { default: Content } = await import('@/app/admin/noticias/PageContent');
        const html = renderToStaticMarkup(React.createElement(Content, tree.props));
        expect(html.match(/name="id"/g)).toHaveLength(25);
        expect(html).toContain('action="/admin/noticias"');
        expect(html).toContain('method="get"');
        expect(html).toContain('26–50 de 53 registros');
        expect(html).toContain('href="/admin/noticias?page=3"');
        expect(html).toContain('rel="prev"');
    });
    it('keeps filtered GET values and accessible navigation without serializing off-page records', async () => {
        const { default: Page } = await import('@/app/admin/noticias/page');
        const { default: Content } = await import('@/app/admin/noticias/PageContent');
        const tree = await Page({
            searchParams: Promise.resolve({
                q: '<script>São Paulo</script>',
                status: 'PUBLICADO',
                categoria: 'category-1',
                page: '2',
            }),
        });
        const html = renderToStaticMarkup(React.createElement(Content, tree.props));
        expect(html).toContain('aria-label="Paginação da listagem"');
        expect(html).toContain('name="q"');
        expect(html).toContain('maxLength="120"');
        expect(html).toContain('status=PUBLICADO');
        expect(html).toContain('categoria=category-1');
        expect(html).not.toContain('<script>São Paulo');
        expect(tree.props.pagination.total).toBe(26);
        expect(tree.props.contagens.publicadas).toBe(53);
    });
    it('preserves the UTC calendar date of a date-only publication in the rendered news table', async () => {
        mocks.posts.mockResolvedValue([
            {
                id: 'synthetic-date-only',
                slug: 'synthetic-date-only',
                title: 'Notícia de teste',
                coverUrl: null,
                status: 'PUBLICADO',
                publishedAt: new Date('2026-10-02T00:00:00.000Z'),
                highlight: false,
                views: 0,
                authorName: 'Equipe sintética',
                category: { id: 'category-1', name: 'Categoria sintética' },
            },
        ]);
        const { default: Page } = await import('@/app/admin/noticias/page');
        const { default: Content } = await import('@/app/admin/noticias/PageContent');
        const tree = await Page({ searchParams: Promise.resolve({}) });
        const html = renderToStaticMarkup(React.createElement(Content, tree.props));
        expect(tree.props.noticias[0].date).toBe('2 de outubro de 2026');
        expect(html).toContain('2 de outubro de 2026');
        expect(html).not.toMatch(/1 de outubro de 2026|01\/10\/2026|21:00/);
    });
    it('checks permission before news or media queries and does not query when denied', async () => {
        mocks.permission.mockRejectedValue(new Error('synthetic permission denied'));
        const { default: NewsPage } = await import('@/app/admin/noticias/page');
        const { default: MediaPage } = await import('@/app/admin/midia/page');
        await expect(NewsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
            'synthetic permission denied',
        );
        await expect(MediaPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
            'synthetic permission denied',
        );
        expect(mocks.posts).not.toHaveBeenCalled();
        expect(mocks.media).not.toHaveBeenCalled();
        expect(mocks.groups).not.toHaveBeenCalled();
    });
    it('renders only 25 media cards, global totals, and preserves linked-file deletion protection', async () => {
        const { default: Page } = await import('@/app/admin/midia/page');
        const { default: Content } = await import('@/app/admin/midia/PageContent');
        const tree = await Page({ searchParams: Promise.resolve({ page: '2' }) });
        expect(tree.props.arquivos).toHaveLength(25);
        expect(tree.props.contagens.total).toBe(53);
        const html = renderToStaticMarkup(React.createElement(Content, tree.props));
        expect(html.match(/<article class="media-item"/g)).toHaveLength(25);
        expect(html).toContain('26–50 de 53 arquivos');
        expect(html).toContain('href="/admin/midia?page=3"');
        expect(html).toContain('Arquivo em uso');
        expect(html.match(/type="submit" disabled=""/g)).toHaveLength(25);
    });
});
