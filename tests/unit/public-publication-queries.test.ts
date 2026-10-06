import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queries = vi.hoisted(() => ({
    editais: vi.fn(),
    documentos: vi.fn(),
    testemunhos: vi.fn(),
    destaque: vi.fn(),
}));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        edital: { findMany: queries.editais },
        documento: { findMany: queries.documentos },
        testemunho: { findMany: queries.testemunhos, findFirst: queries.destaque },
    },
}));
import {
    getFeaturedTestemunho,
    listDocumentos,
    listEditais,
    listTestemunhos,
} from '@/lib/server/queries';

const reference = new Date('2026-09-22T12:00:00.000Z');
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(reference);
    for (const query of Object.values(queries)) query.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('barreira de publicação antes da renderização e tradução públicas', () => {
    it.each([
        ['editais', listEditais, queries.editais],
        ['documentos', listDocumentos, queries.documentos],
    ] as const)(
        '%s aplica publicação e data no banco, inclusive no instante atual',
        async (_name, load, query) => {
            await load();
            expect(query).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    where: { published: true, publishedAt: { lte: reference } },
                }),
            );
        },
    );

    it.each([
        ['listagem', listTestemunhos, queries.testemunhos, {}],
        ['destaque', getFeaturedTestemunho, queries.destaque, { featured: true }],
    ] as const)(
        'testemunho na %s exige consentimento, publicação e data em conjunto',
        async (_name, load, query, extra) => {
            await load();
            expect(query).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    where: {
                        published: true,
                        publishedAt: { lte: reference },
                        consent: true,
                        ...extra,
                    },
                }),
            );
        },
    );

    it('reavalia o relógio em cada chamada, não no momento de importar o módulo', async () => {
        await Promise.all([
            listEditais(),
            listDocumentos(),
            listTestemunhos(),
            getFeaturedTestemunho(),
        ]);
        const later = new Date(reference.getTime() + 60_000);
        vi.setSystemTime(later);
        await Promise.all([
            listEditais(),
            listDocumentos(),
            listTestemunhos(),
            getFeaturedTestemunho(),
        ]);
        for (const query of Object.values(queries)) {
            expect(query.mock.calls[0][0].where.publishedAt.lte).toEqual(reference);
            expect(query.mock.calls[1][0].where.publishedAt.lte).toEqual(later);
        }
    });
});
