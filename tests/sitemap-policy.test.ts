import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    env: { appUrl: 'https://spm-hml.35.215.232.88.sslip.io' },
    posts: vi.fn(),
    years: vi.fn(),
}));
vi.mock('@/lib/server/env', () => ({ env: mocks.env }));
vi.mock('@/lib/server/queries', () => ({
    listPublishedPostSlugs: mocks.posts,
    listSemanaAnos: mocks.years,
}));
import sitemap from '@/app/sitemap';

describe('sitemap environment and truthful dates', () => {
    beforeEach(() => {
        mocks.posts.mockReset();
        mocks.years.mockReset();
    });
    it('returns no HML links and does not read the database', async () => {
        mocks.env.appUrl = 'https://spm-hml.35.215.232.88.sslip.io';
        expect(await sitemap()).toEqual([]);
        expect(mocks.posts).not.toHaveBeenCalled();
        expect(mocks.years).not.toHaveBeenCalled();
    });
    it('publishes canonical production routes and actual editorial dates', async () => {
        mocks.env.appUrl = 'https://spmnacional.org.br';
        const updatedAt = new Date('2026-10-01T12:00:00Z');
        mocks.posts.mockResolvedValue([{ slug: 'noticia-publicada', updatedAt }]);
        mocks.years.mockResolvedValue([2026, 2026]);
        const entries = await sitemap();
        expect(entries.every((entry) => entry.url.startsWith('https://spmnacional.org.br/'))).toBe(
            true,
        );
        expect(
            entries.find((entry) => entry.url.endsWith('/noticia-publicada'))?.lastModified,
        ).toEqual(updatedAt);
        expect(
            entries.find((entry) => entry.url === 'https://spmnacional.org.br/')?.lastModified,
        ).toBeUndefined();
        expect(new Set(entries.map((entry) => entry.url)).size).toBe(entries.length);
        expect(
            entries.some(
                (entry) =>
                    entry.url.endsWith('/obrigado') || entry.url.endsWith('/estudos-de-caso'),
            ),
        ).toBe(false);
    });
    it('keeps the fixed sitemap available when editorial queries fail', async () => {
        mocks.env.appUrl = 'https://spmnacional.org.br';
        mocks.posts.mockRejectedValue(new Error('synthetic unavailable'));
        mocks.years.mockRejectedValue(new Error('synthetic unavailable'));
        expect((await sitemap()).some((entry) => entry.url.endsWith('/fale-conosco'))).toBe(true);
    });
});
