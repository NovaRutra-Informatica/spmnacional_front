import { createElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { collectPublicText, mapPublicTree, normalizeText } from '@/lib/i18n/tree';
import { localizeHref } from '@/lib/i18n/links';
import { publicCategory, publicPageNumber } from '@/lib/i18n/pagination';

describe('public translation boundaries', () => {
    afterEach(() => vi.unstubAllEnvs());
    it('collects only visible copy, never values, identifiers, URLs or private opt-out content', () => {
        const node = createElement(
            'div',
            null,
            createElement('input', {
                placeholder: 'Seu e-mail',
                value: 'personal@example.org',
                name: 'email',
            }),
            createElement(
                'a',
                { href: 'https://example.org/private', title: 'Leia mais' },
                'Uma notícia',
            ),
            createElement('textarea', { defaultValue: 'Relato privado' }, 'Relato privado'),
            createElement('p', { translate: 'no' }, 'Não traduzir'),
        );
        expect(collectPublicText(node)).toEqual(['Seu e-mail', 'Leia mais', 'Uma notícia']);
    });
    it('preserves handlers, object identity for callbacks, form values and enum filters', () => {
        const callback = () => undefined;
        const input = createElement(
            'section',
            {
                onClick: callback,
                posts: [{ title: 'Título', category: 'INSTITUCIONAL', slug: 'slug-original' }],
                categories: [{ name: 'Notícias', slug: 'noticias' }],
            },
            ' Texto ',
        );
        const result = mapPublicTree(input, (text) => `EN:${text}`) as ReactElement<
            Record<string, unknown>
        >;
        expect(result.props.onClick).toBe(callback);
        expect(result.props.posts).toEqual([
            { title: 'EN:Título', category: 'INSTITUCIONAL', slug: 'slug-original' },
        ]);
        expect(result.props.categories).toEqual([{ name: 'EN:Notícias', slug: 'noticias' }]);
        expect(result.props.children).toBe(' EN:Texto ');
    });
    it('does not send html strings or counter values to the provider', () => {
        expect(
            collectPublicText(
                createElement(
                    'div',
                    { dangerouslySetInnerHTML: { __html: '<p>Raw HTML</p>' } },
                    123,
                ),
            ),
        ).toEqual([]);
        expect(normalizeText('  Olá\n mundo  ')).toBe('Olá mundo');
    });
    it.each(['/admin', '/atendente', '/convite/token', '/api/arquivos/file', '//evil.example.org'])(
        'does not add locale to %s',
        (href) => expect(localizeHref(href, 'ar')).toBe(href),
    );
    it('keeps navigation filters and anchors, and removes language on Portuguese links', () => {
        expect(localizeHref('/publicacoes/blog?page=2#lista', 'fr')).toBe(
            '/publicacoes/blog?page=2&lang=fr#lista',
        );
        expect(localizeHref('/?lang=ar', 'pt')).toBe('/');
    });
    it('overwrites spoofed locale and path headers, makes public language private to the request', () => {
        vi.stubEnv('APP_URL', 'https://spmnacional.org.br');
        const response = proxy(
            new NextRequest('https://spm.example.org/?lang=ar', {
                headers: { 'x-spm-locale': 'secret', 'x-spm-pathname': '/admin' },
            }),
        );
        expect(response.headers.get('x-middleware-request-x-spm-locale')).toBe('ar');
        expect(response.headers.get('x-middleware-request-x-spm-pathname')).toBe('/');
        expect(response.headers.get('cache-control')).toContain('private');
        expect(response.headers.get('x-robots-tag')).toBe('noindex, follow');
    });
    it('never applies public translation preferences to admin/login', () => {
        const response = proxy(new NextRequest('https://spm.example.org/atendente?lang=ar'));
        expect(response.headers.get('x-middleware-request-x-spm-locale')).toBe('pt');
    });
    it.each(['0', '-1', '1e9', 'NaN', '99999999', ['2'], undefined])(
        'bounds page input %s',
        (page) => expect(publicPageNumber(page)).toBe(1),
    );
    it('validates category identifiers without reflecting arbitrary text', () => {
        expect(publicPageNumber('3')).toBe(3);
        expect(publicCategory('direitos-humanos')).toBe('direitos-humanos');
        expect(publicCategory('texto livre enviado pelo visitante')).toBeUndefined();
    });
});
