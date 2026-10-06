import { describe, expect, it } from 'vitest';
import {
    contentMetadata,
    isPublicIndexingEnabled,
    pageMetadata,
    publicAssetOrigin,
    PRODUCTION_ORIGIN,
    PUBLIC_PAGE_SEO,
    robotsPolicy,
    type PublicPagePath,
} from '@/lib/seo';

describe('public SEO policy', () => {
    it('resolves social images in the actual preview without changing canonicals', () => {
        expect(publicAssetOrigin('https://spm-hml.35.215.232.88.sslip.io/')).toBe(
            'https://spm-hml.35.215.232.88.sslip.io',
        );
        expect(publicAssetOrigin('http://localhost:3147')).toBe('http://localhost:3147');
        for (const origin of [
            undefined,
            'invalid',
            'javascript:alert(1)',
            'https://user:pass@example.invalid',
            'https://example.invalid/path?secret=synthetic',
        ])
            expect(publicAssetOrigin(origin)).toBe(PRODUCTION_ORIGIN);
        expect(pageMetadata('/fale-conosco').alternates?.canonical).toBe(
            `${PRODUCTION_ORIGIN}/fale-conosco`,
        );
    });
    it.each(['https://spmnacional.org.br', 'https://www.spmnacional.org.br/'])(
        'indexes the approved production origin %s',
        (origin) => {
            expect(isPublicIndexingEnabled(origin)).toBe(true);
        },
    );
    it.each([
        undefined,
        '',
        'invalid',
        'http://spmnacional.org.br',
        'https://spmnacional.org.br.evil.test',
        'https://evil.test/spmnacional.org.br',
        'https://spmnacional.org.br:8443',
        'https://spmnacional.org.br/path',
        'https://spmnacional.org.br?preview=1',
        'https://user:password@spmnacional.org.br',
        'http://localhost:3147',
        'https://spm-hml.35.215.232.88.sslip.io',
        'https://hml.endpoints.site-institucional-510319.cloud.goog',
    ])('keeps previews out of the index: %s', (origin) => {
        expect(isPublicIndexingEnabled(origin)).toBe(false);
        expect(robotsPolicy(origin)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    });
    it('keeps public files crawlable and service/token routes excluded', () => {
        const policy = robotsPolicy(PRODUCTION_ORIGIN);
        const rules = policy.rules as { disallow: string[] };
        expect(rules.disallow).toContain('/api/admin');
        expect(rules.disallow).toContain('/fale-conosco/obrigado');
        expect(rules.disallow).not.toContain('/api');
        expect(policy.sitemap).toBe(`${PRODUCTION_ORIGIN}/sitemap.xml`);
    });
    it('gives every public page a distinct title, description and canonical', () => {
        const titles = new Set<string>();
        const descriptions = new Set<string>();
        for (const path of Object.keys(PUBLIC_PAGE_SEO) as PublicPagePath[]) {
            const [title, description] = PUBLIC_PAGE_SEO[path];
            expect(titles.has(title)).toBe(false);
            expect(descriptions.has(description)).toBe(false);
            expect(description.length).toBeGreaterThan(70);
            titles.add(title);
            descriptions.add(description);
            const metadata = pageMetadata(path);
            expect(metadata.alternates?.canonical).toBe(
                new URL(path, PRODUCTION_ORIGIN).toString(),
            );
            expect(metadata.openGraph?.description).toBe(description);
            expect(metadata.twitter?.description).toBe(description);
        }
    });
    it('does not pass contact data or query strings to dynamic canonicals', () => {
        expect(
            contentMetadata('/publicacoes/blog/acolhimento', 'Acolhimento', 'Relato publicado')
                .alternates?.canonical,
        ).toBe(`${PRODUCTION_ORIGIN}/publicacoes/blog/acolhimento`);
        expect(
            contentMetadata(
                '/fale-conosco?email=synthetic@example.invalid#private',
                'Contato',
                'Contato',
            ).alternates?.canonical,
        ).toBe(`${PRODUCTION_ORIGIN}/fale-conosco`);
        expect(
            contentMetadata('//external.invalid/escape', 'Teste', 'Teste').alternates?.canonical,
        ).toBe(`${PRODUCTION_ORIGIN}/`);
    });
});
