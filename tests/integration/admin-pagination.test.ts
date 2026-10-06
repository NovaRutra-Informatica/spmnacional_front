import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './guard';
import { prisma } from '@/lib/server/db';
import { listAdminMedia, listAdminNews } from '@/lib/server/admin-listing';
import { mediaFilters, newsFilters } from '@/lib/admin-pagination';

const prefix = 'isolated-admin-pagination';
const categoryId = `${prefix}-category`;
const tagId = `${prefix}-tag`;
const search = 'SyntheticPaginationOnly';

beforeAll(async () => {
    await prisma.category.create({ data: { id: categoryId, slug: categoryId, name: categoryId } });
    await prisma.tag.create({ data: { id: tagId, slug: tagId, name: `${search} tag` } });
    await prisma.post.createMany({
        data: Array.from({ length: 53 }, (_, index) => ({
            id: `${prefix}-${String(index).padStart(2, '0')}`,
            slug: `${prefix}-${index}`,
            title: `Synthetic pagination news ${index}`,
            excerpt: 'Synthetic fixture',
            content: 'Synthetic fixture',
            categoryId,
            authorName: index === 51 ? `${search} author` : 'Synthetic author',
            status: index % 2 ? 'PUBLICADO' : 'RASCUNHO',
            updatedAt: new Date('2026-01-01T12:00:00Z'),
        })),
    });
    await prisma.post.update({
        where: { id: `${prefix}-52` },
        data: { title: `${search} title`, updatedAt: new Date('2026-01-01T12:00:00Z') },
    });
    await prisma.postTag.create({ data: { postId: `${prefix}-50`, tagId } });
    await prisma.media.createMany({
        data: Array.from({ length: 53 }, (_, index) => ({
            id: `${prefix}-media-${String(index).padStart(2, '0')}`,
            filename: `${prefix}-${index}.pdf`,
            originalName: `${search}-${index}.pdf`,
            mimeType: 'application/pdf',
            size: 10,
            kind: 'DOCUMENTO',
            url: `/uploads/${prefix}-${index}.pdf`,
            storageKey: `${prefix}-${index}`,
            createdAt: new Date('2026-01-01T12:00:00Z'),
        })),
    });
});

afterAll(async () => {
    await prisma.post.deleteMany({ where: { categoryId } });
    await prisma.tag.deleteMany({ where: { id: tagId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.media.deleteMany({ where: { id: { startsWith: `${prefix}-media-` } } });
    await prisma.$disconnect();
});

describe('real SQL admin pagination', () => {
    it('returns each of 53 matching posts once across three bounded, stably ordered pages', async () => {
        const pages = await Promise.all(
            [1, 2, 3].map((page) =>
                listAdminNews(newsFilters({ categoria: categoryId, page: String(page) })),
            ),
        );
        expect(pages.map((page) => page.posts.length)).toEqual([25, 25, 3]);
        const ids = pages.flatMap((page) => page.posts.map((post) => post.id));
        expect(new Set(ids).size).toBe(53);
        expect(ids).toEqual([...ids].sort().reverse());
        const last = await listAdminNews(newsFilters({ categoria: categoryId, page: '9999' }));
        expect(last.posts.map((post) => post.id)).toEqual(pages[2].posts.map((post) => post.id));
        expect(last.pagination.page).toBe(3);
    });
    it('finds title, author and tag matches anywhere in the database, with combined status and category filters', async () => {
        const result = await listAdminNews(
            newsFilters({ q: search.toLowerCase(), categoria: categoryId }),
        );
        expect(result.posts.map((post) => post.id).sort()).toEqual([
            `${prefix}-50`,
            `${prefix}-51`,
            `${prefix}-52`,
        ]);
        const published = await listAdminNews(
            newsFilters({ q: search, categoria: categoryId, status: 'PUBLICADO' }),
        );
        expect(published.posts.map((post) => post.id)).toEqual([`${prefix}-51`]);
        expect(published.pagination.total).toBe(1);
        expect(published.contagens.rascunhos).toBeGreaterThanOrEqual(27);
    });
    it('bounds media by filename/type and reaches the remaining records through navigation', async () => {
        const pages = await Promise.all(
            [1, 2, 3].map((page) =>
                listAdminMedia(mediaFilters({ q: search, tipo: 'DOCUMENTO', page: String(page) })),
            ),
        );
        expect(pages.map((page) => page.arquivos.length)).toEqual([25, 25, 3]);
        expect(new Set(pages.flatMap((page) => page.arquivos.map((file) => file.id))).size).toBe(
            53,
        );
        const empty = await listAdminMedia(mediaFilters({ q: search, tipo: 'IMAGEM' }));
        expect(empty.arquivos).toEqual([]);
        expect(empty.contagens.documentos).toBeGreaterThanOrEqual(53);
    });
    it('treats SQL wildcards and query-shaped input as literal search text', async () => {
        for (const q of ['%', '_', "' OR 1=1 --", '\\']) {
            const news = await listAdminNews(newsFilters({ q, categoria: categoryId }));
            expect(news.posts).toEqual([]);
            expect(news.pagination.total).toBe(0);
        }
        const media = await listAdminMedia(mediaFilters({ q: '%', tipo: 'DOCUMENTO' }));
        expect(media.arquivos).toEqual([]);
    });
});
