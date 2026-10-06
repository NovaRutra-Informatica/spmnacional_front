import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import './guard';
import { PrismaClient } from '../../lib/generated/prisma/client';

const state = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock('../../lib/server/db', () => ({
    get prisma() {
        return state.client;
    },
}));
let queries: typeof import('../../lib/server/queries');
const prefix = 'article-query-isolated-';
const publishedAt = new Date(Date.now() - 1000);
const sqlQueries: string[] = [];
beforeAll(async () => {
    const client = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
        log: [{ emit: 'event', level: 'query' }],
    });
    client.$on('query', (event) => {
        sqlQueries.push(event.query);
    });
    state.client = client;
    queries = await import('../../lib/server/queries');
    await client.category.create({ data: { id: prefix, slug: prefix, name: prefix } });
    const tag = await client.tag.create({ data: { id: prefix, slug: prefix, name: 'Public tag' } });
    for (const [slug, status, date] of [
        ['current', 'PUBLICADO', publishedAt],
        ['draft', 'RASCUNHO', publishedAt],
        ['future', 'PUBLICADO', new Date('2100-01-01T00:00:00Z')],
        ...Array.from({ length: 6 }, (_, i) => [`related-${i}`, 'PUBLICADO', publishedAt] as const),
    ] as const) {
        await client.post.create({
            data: {
                id: prefix + slug,
                slug: prefix + slug,
                title: `Synthetic ${slug}`,
                excerpt: 'Public excerpt',
                content: 'Public Markdown body',
                authorName: 'Public signature',
                categoryId: prefix,
                status,
                publishedAt: date,
                tags: { create: { tagId: tag.id } },
            },
        });
    }
});
afterAll(async () => {
    await state.client?.post.deleteMany({ where: { id: { startsWith: prefix } } });
    await state.client?.tag.deleteMany({ where: { id: prefix } });
    await state.client?.category.deleteMany({ where: { id: prefix } });
    await state.client?.$disconnect();
});

describe('projeção de artigo público no PostgreSQL isolado', () => {
    it('mantém corpo, assinatura e tags públicos sem identificadores internos ou campos editoriais', async () => {
        const article = await queries.getPostBySlug(prefix + 'current');
        expect(article).toMatchObject({
            content: 'Public Markdown body',
            authorName: 'Public signature',
            category: { name: prefix },
            tags: [{ tag: { name: 'Public tag', slug: prefix } }],
        });
        for (const field of [
            'author',
            'authorId',
            'categoryId',
            'coverMediaId',
            'status',
            'views',
            'highlight',
            'createdAt',
            'updatedAt',
        ]) {
            expect(article).not.toHaveProperty(field);
        }
        expect(article?.tags[0]).not.toHaveProperty('postId');
        expect(article?.tags[0]).not.toHaveProperty('tagId');
    });

    it('não revela rascunho nem artigo futuro por slug', async () => {
        expect(await queries.getPostBySlug(prefix + 'draft')).toBeNull();
        expect(await queries.getPostBySlug(prefix + 'future')).toBeNull();
    });

    it('Leia também retorna quatro links estáveis sem o artigo atual, corpo ou consulta de relações', async () => {
        sqlQueries.length = 0;
        const links = await queries.listRelatedPublishedPostLinks(prefix + 'current');
        expect(links).toHaveLength(4);
        expect(links.map((link) => link.slug)).toEqual(
            [5, 4, 3, 2].map((i) => prefix + `related-${i}`),
        );
        expect(links.every((link) => Object.keys(link).sort().join(',') === 'slug,title')).toBe(
            true,
        );
        expect(sqlQueries).toHaveLength(1);
        expect(sqlQueries[0]).not.toMatch(/Category|PostTag|Tag/);
    });

    it('contagem concorrente não perde leituras e UPDATE não retorna o corpo do artigo', async () => {
        sqlQueries.length = 0;
        await Promise.all(
            Array.from({ length: 10 }, () => queries.incrementPostViews(prefix + 'current')),
        );
        const updates = sqlQueries.filter((query) => /^UPDATE /i.test(query));
        expect(updates).toHaveLength(10);
        for (const update of updates)
            expect(update.split(/RETURNING/i)[1]).not.toMatch(/content|authorId|status/);
        expect(
            (await state.client!.post.findUniqueOrThrow({ where: { id: prefix + 'current' } }))
                .views,
        ).toBe(10);
    });
});
