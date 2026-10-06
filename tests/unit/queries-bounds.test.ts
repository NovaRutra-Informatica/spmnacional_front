import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ posts: vi.fn(), agenda: vi.fn() }));
vi.mock('../../lib/server/db', () => ({ prisma: { post: { findMany: mocks.posts }, agendaEvent: { findMany: mocks.agenda } } }));
import { listPublishedPosts, listAgendaEvents } from '../../lib/server/queries';
beforeEach(() => vi.clearAllMocks());

describe('consultas públicas limitadas e ordenadas sem N+1 de categorias', () => {
    it('clampa paginação inválida e mantém ordenação estável e relações projetadas', async () => {
        await listPublishedPosts({ take: Infinity, skip: -1 });
        const query = mocks.posts.mock.calls[0][0];
        expect(query).toMatchObject({ take: 50, skip: 0, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] });
        expect(query.select.category).toEqual({ select: { name: true, slug: true } });
        await listPublishedPosts({ take: 1000, skip: 10_000_000 });
        expect(mocks.posts.mock.calls[1][0]).toMatchObject({ take: 100, skip: 100_000 });
    });
    it('preserva página solicitada e o filtro de publicação/data/categoria', async () => {
        await listPublishedPosts({ take: 12, skip: 24, categorySlug: 'acolhimento' });
        expect(mocks.posts.mock.calls[0][0]).toMatchObject({ take: 12, skip: 24, where: {
            status: 'PUBLICADO', publishedAt: { lte: expect.any(Date) }, category: { slug: 'acolhimento' },
        } });
    });
    it('agenda tem orçamento fixo e recusa take negativo/fractional', async () => {
        await listAgendaEvents({ take: -1 });
        await listAgendaEvents({ take: 1.5 });
        expect(mocks.agenda.mock.calls.every(([value]) => value.take === 100)).toBe(true);
        await listAgendaEvents({ take: 6, past: true });
        expect(mocks.agenda.mock.calls[2][0]).toMatchObject({ take: 6, orderBy: { startsAt: 'desc' }, where: { published: true } });
    });
});
