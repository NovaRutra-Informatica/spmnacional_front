import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    adminPageHref,
    adminPagination,
    mediaFilters,
    newsFilters,
    newsWhere,
} from '@/lib/admin-pagination';

const mocks = vi.hoisted(() => ({
    posts: vi.fn(),
    postCount: vi.fn(),
    postGroups: vi.fn(),
    categories: vi.fn(),
    media: vi.fn(),
    mediaCount: vi.fn(),
    mediaGroups: vi.fn(),
}));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        post: { findMany: mocks.posts, count: mocks.postCount, groupBy: mocks.postGroups },
        category: { findMany: mocks.categories },
        media: { findMany: mocks.media, count: mocks.mediaCount, groupBy: mocks.mediaGroups },
    },
}));
import { listAdminMedia, listAdminNews } from '@/lib/server/admin-listing';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.posts.mockResolvedValue([]);
    mocks.postGroups.mockResolvedValue([
        { status: 'PUBLICADO', _count: { _all: 40 } },
        { status: 'RASCUNHO', _count: { _all: 13 } },
    ]);
    mocks.postCount.mockResolvedValue(26);
    mocks.categories.mockResolvedValue([]);
    mocks.media.mockResolvedValue([]);
    mocks.mediaGroups.mockResolvedValue([
        { kind: 'IMAGEM', _count: { _all: 40 } },
        { kind: 'DOCUMENTO', _count: { _all: 13 } },
    ]);
    mocks.mediaCount.mockResolvedValue(26);
});

describe('validated admin pagination', () => {
    it('does not interpret repeated parameters, operators or malformed pages as database input', () => {
        expect(
            newsFilters({
                q: ['one', 'two'],
                status: 'DROP TABLE',
                categoria: '../admin',
                page: '-1',
            }),
        ).toEqual({ q: '', status: 'todos', categoria: 'todas', page: 1 });
        for (const page of ['1.2', 'Infinity', '1e4', '9999999999999999', '0', '']) {
            expect(newsFilters({ page }).page).toBe(1);
        }
        expect(mediaFilters({ tipo: ['IMAGEM', 'OUTRO'], page: ['2', '3'] }).tipo).toBe('todos');
    });
    it('bounds search input and combines title, author and tag search with status/category', () => {
        const filters = newsFilters({
            q: '  Acolhida\u0000  ',
            status: 'REVISAO',
            categoria: 'category-2',
            page: '2',
        });
        expect(filters).toEqual({
            q: 'Acolhida',
            status: 'REVISAO',
            categoria: 'category-2',
            page: 2,
        });
        expect(newsFilters({ q: 'x'.repeat(500) }).q).toHaveLength(120);
        expect(newsWhere(filters)).toEqual({
            status: 'REVISAO',
            categoryId: 'category-2',
            OR: [
                { title: { contains: 'Acolhida', mode: 'insensitive' } },
                { authorName: { contains: 'Acolhida', mode: 'insensitive' } },
                {
                    tags: {
                        some: { tag: { name: { contains: 'Acolhida', mode: 'insensitive' } } },
                    },
                },
            ],
        });
    });
    it('clamps out-of-range pages after counting, without losing the last records', () => {
        expect(adminPagination(99999, 53)).toEqual({
            page: 3,
            totalPages: 3,
            total: 53,
            from: 51,
            to: 53,
        });
        expect(adminPagination(2, 0)).toEqual({ page: 1, totalPages: 1, total: 0, from: 0, to: 0 });
    });
    it('keeps percent, underscore and backslash literal instead of creating ILIKE wildcards', () => {
        expect(newsWhere(newsFilters({ q: '50%_\\' })).OR?.[0]).toEqual({
            title: { contains: '50\\%\\_\\\\', mode: 'insensitive' },
        });
    });
    it('preserves and encodes all filters in navigation, including non-ASCII search', () => {
        const filters = newsFilters({
            q: 'São Paulo & apoio',
            status: 'REVISAO',
            categoria: 'category-2',
        });
        const url = new URL(adminPageHref('/admin/noticias', filters, 2), 'https://example.test');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            q: 'São Paulo & apoio',
            status: 'REVISAO',
            categoria: 'category-2',
            page: '2',
        });
        expect(
            adminPageHref('/admin/midia', mediaFilters({ q: 'arquivo.pdf', tipo: 'DOCUMENTO' }), 3),
        ).toBe('/admin/midia?q=arquivo.pdf&tipo=DOCUMENTO&page=3');
    });
    it('queries only the second 25 news records and keeps global counters outside the filtered listing', async () => {
        const result = await listAdminNews(
            newsFilters({ q: 'acolhida', status: 'PUBLICADO', page: '2' }),
        );
        expect(mocks.posts).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 25,
                skip: 25,
                orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            }),
        );
        expect(mocks.postCount).toHaveBeenCalledWith({
            where: newsWhere(newsFilters({ q: 'acolhida', status: 'PUBLICADO', page: '2' })),
        });
        expect(mocks.postGroups).toHaveBeenCalledWith({ by: ['status'], _count: { _all: true } });
        expect(result.contagens).toEqual({
            publicadas: 40,
            rascunhos: 13,
            revisao: 0,
            agendadas: 0,
        });
        expect(result.pagination).toMatchObject({ page: 2, total: 26, to: 26 });
        expect(mocks.posts.mock.calls[0][0].select).not.toHaveProperty('tags');
    });
    it('avoids duplicate total counts for an unfiltered page and uses the final valid offset', async () => {
        await listAdminNews(newsFilters({ page: '99999' }));
        expect(mocks.postCount).not.toHaveBeenCalled();
        expect(mocks.posts.mock.calls[0][0]).toMatchObject({ take: 25, skip: 50, where: {} });
    });
    it('bounds media queries and preserves global totals, relational usage counts and filters', async () => {
        const result = await listAdminMedia(
            mediaFilters({ q: 'manual', tipo: 'DOCUMENTO', page: '2' }),
        );
        expect(mocks.media.mock.calls[0][0]).toMatchObject({
            take: 25,
            skip: 25,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            where: { kind: 'DOCUMENTO', originalName: { contains: 'manual', mode: 'insensitive' } },
            select: {
                _count: {
                    select: { posts: true, editais: true, documentos: true, materiais: true },
                },
            },
        });
        expect(result.contagens).toEqual({ total: 53, imagens: 40, documentos: 13 });
    });
});
