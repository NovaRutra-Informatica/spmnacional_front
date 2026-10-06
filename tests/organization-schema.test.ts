import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ORGANIZATION_SCHEMA } from '@/lib/content/organization';

vi.mock('next/headers', () => ({
    headers: async () => new Headers({ 'x-nonce': 'synthetic-nonce-for-structured-data' }),
}));
vi.mock('@/lib/server/queries', () => ({
    listPublishedPosts: async () => [],
    getHomeStats: async () => ({}),
}));
beforeAll(() => {
    vi.stubGlobal('React', React);
});

describe('institutional structured data', () => {
    it('projects only existing institutional address and phone, without invented ratings or hours', () => {
        expect(ORGANIZATION_SCHEMA['@type']).toBe('NGO');
        expect(ORGANIZATION_SCHEMA.url).toBe('https://spmnacional.org.br');
        expect(ORGANIZATION_SCHEMA.address).toEqual({
            '@type': 'PostalAddress',
            streetAddress: 'Rua Caiambé, 126, Ipiranga',
            addressLocality: 'São Paulo',
            addressRegion: 'SP',
            postalCode: '04264-060',
            addressCountry: 'BR',
        });
        expect(ORGANIZATION_SCHEMA.contactPoint.telephone.replace(/[^+\d]/g, '')).toBe(
            '+551120637064',
        );
        expect(Object.keys(ORGANIZATION_SCHEMA).sort()).toEqual(
            [
                '@context',
                '@id',
                '@type',
                'address',
                'alternateName',
                'contactPoint',
                'name',
                'url',
            ].sort(),
        );
    });
    it('renders real server JSON-LD with the trusted request nonce', async () => {
        const { default: StructuredData } = await import('@/components/StructuredData');
        const html = renderToStaticMarkup(await StructuredData({ data: ORGANIZATION_SCHEMA }));
        expect(html).toContain('type="application/ld+json"');
        expect(html).toContain('nonce="synthetic-nonce-for-structured-data"');
        const json = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'));
        expect(JSON.parse(json)).toEqual(ORGANIZATION_SCHEMA);
    });
    it('escapes an attempted closing script while preserving the JSON projection', async () => {
        const { default: StructuredData } = await import('@/components/StructuredData');
        const value = { name: '</script><script>alert(1)</script>', '@type': 'NGO' };
        const html = renderToStaticMarkup(await StructuredData({ data: value }));
        expect(html.match(/<script/g)).toHaveLength(1);
        expect(
            JSON.parse(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'))),
        ).toEqual(value);
    });
    it('publishes the organization schema once on the public homepage', async () => {
        const { default: Home } = await import('@/app/page');
        const { default: StructuredData } = await import('@/components/StructuredData');
        const tree = await Home();
        let found = 0;
        function visit(node: React.ReactNode) {
            React.Children.forEach(node, (child) => {
                if (!React.isValidElement<{ children?: React.ReactNode; data?: unknown }>(child))
                    return;
                if (child.type === StructuredData) {
                    found++;
                    expect(child.props.data).toBe(ORGANIZATION_SCHEMA);
                }
                visit(child.props.children);
            });
        }
        visit(tree);
        expect(found).toBe(1);
    });
});
