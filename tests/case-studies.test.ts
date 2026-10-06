import { describe, expect, it } from 'vitest';
import { CASE_STUDIES, publishedCaseStudies, type CaseStudy } from '@/lib/content/case-studies';

const NOW = new Date('2026-10-02T12:00:00Z');
const fixture: CaseStudy = {
    slug: 'caso-de-teste',
    title: 'Caso sintético para teste',
    context: 'Contexto sintético',
    actions: 'Ações sintéticas',
    outcomes: 'Resultados sintéticos',
    sourceUrl: 'https://example.org/fonte-de-teste',
    sourceLabel: 'Fonte sintética de teste',
    authorizationConfirmed: true,
    published: true,
    publishedAt: '2026-10-01T12:00:00Z',
};

describe('case study publication boundary', () => {
    it('ships no invented case studies', () => {
        expect(CASE_STUDIES).toEqual([]);
    });
    it('accepts complete authorized publication with a valid source', () => {
        expect(publishedCaseStudies([fixture], NOW)).toEqual([fixture]);
    });
    it.each([
        { authorizationConfirmed: false },
        { published: false },
        { sourceUrl: '' },
        { sourceUrl: 'javascript:alert(1)' },
        { sourceUrl: 'http://example.org/' },
        { sourceUrl: 'https://user:pass@example.org/' },
        { sourceLabel: '' },
        { context: ' ' },
        { outcomes: '' },
        { slug: '../escape' },
        { publishedAt: 'invalid' },
        { publishedAt: '2026-10-03T12:00:00Z' },
    ])('excludes unavailable or unverifiable case: %j', (change) => {
        expect(publishedCaseStudies([{ ...fixture, ...change }], NOW)).toEqual([]);
    });
});
