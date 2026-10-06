import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import './guard';
import { PrismaClient } from '../../lib/generated/prisma/client';

const state = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock('../../lib/server/db', () => ({ get prisma() { return state.client; } }));
let listPublishedPosts: typeof import('../../lib/server/queries').listPublishedPosts;
let queryCount = 0;
const prefix = 'query-shape-isolated-';
beforeAll(async () => {
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
        log: [{ emit: 'event', level: 'query' }] });
    client.$on('query', () => { queryCount += 1; });
    state.client = client;
    ({ listPublishedPosts } = await import('../../lib/server/queries'));
    for (let index = 0; index < 25; index++) {
        const id = prefix + index;
        await client.category.create({ data: { id, slug: id, name: id } });
        await client.post.create({ data: { id, slug: id, title: 'Synthetic query fixture', excerpt: 'Synthetic',
            content: 'Synthetic body', authorName: 'Synthetic author', categoryId: id,
            status: 'PUBLICADO', publishedAt: new Date('2000-01-01T00:00:00Z') } });
    }
});
afterAll(async () => {
    await state.client?.post.deleteMany({ where: { id: { startsWith: prefix } } });
    await state.client?.category.deleteMany({ where: { id: { startsWith: prefix } } });
    await state.client?.$disconnect();
});

describe('consultas públicas sem N+1 no PostgreSQL real', () => {
    it('aumentar de 1 para 25 categorias mantém o número de consultas limitado', async () => {
        await state.client!.$queryRaw`SELECT 1`;
        queryCount = 0;
        await listPublishedPosts({ take: 1 });
        const singleQueries = queryCount;
        queryCount = 0;
        const posts = await listPublishedPosts({ take: 100 });
        const batchQueries = queryCount;
        expect(posts.filter(post => post.id.startsWith(prefix))).toHaveLength(25);
        expect(singleQueries).toBeGreaterThan(0);
        expect(singleQueries).toBeLessThanOrEqual(3);
        expect(batchQueries).toBeLessThanOrEqual(singleQueries + 1);
        expect(batchQueries).toBeLessThanOrEqual(3);
        expect(posts.every(post => Object.keys(post.category).sort().join(',') === 'name,slug')).toBe(true);
        expect(posts.every(post => !('content' in post) && !('author' in post))).toBe(true);
    });
});
