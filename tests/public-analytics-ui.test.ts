import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ locale: 'fr', pathname: '/', nextLink: vi.fn() }));
vi.mock('@/components/TranslationProvider', () => ({
    TranslatedContent: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    usePublicTranslation: () => ({ locale: context.locale }),
}));
vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => {
        context.nextLink(href);
        return React.createElement('a', { href, 'data-next-link': 'true' }, children);
    },
}));
vi.mock('next/navigation', () => ({ usePathname: () => context.pathname }));

beforeAll(() => {
    vi.stubGlobal('React', React);
});
beforeEach(() => {
    context.nextLink.mockClear();
    context.pathname = '/';
    context.locale = 'fr';
});

describe('public analytics UI boundaries', () => {
    it.each(['/atendente', '/admin', '/admin/acessos', '/convite/synthetic?token=synthetic'])(
        'uses a fresh document for private link %s',
        async (href) => {
            const { default: LocalizedLink } = await import('@/components/LocalizedLink');
            const html = renderToStaticMarkup(
                React.createElement(
                    LocalizedLink,
                    { href, prefetch: false, replace: true },
                    'Área privada',
                ),
            );
            expect(html).toContain(`href="${href}"`);
            expect(html).not.toContain('lang=');
            expect(html).not.toContain('data-next-link');
            expect(html).not.toContain('prefetch=');
            expect(context.nextLink).not.toHaveBeenCalled();
        },
    );
    it('keeps public navigation localized and routed by Next', async () => {
        const { default: LocalizedLink } = await import('@/components/LocalizedLink');
        const html = renderToStaticMarkup(
            React.createElement(LocalizedLink, { href: '/fale-conosco#formulario' }, 'Contato'),
        );
        expect(html).toContain('href="/fale-conosco?lang=fr#formulario"');
        expect(context.nextLink).toHaveBeenCalledWith('/fale-conosco?lang=fr#formulario');
    });
    it('offers explicit refusal and permission without loading a tag in server markup', async () => {
        const { default: AnalyticsConsent } = await import('@/components/AnalyticsConsent');
        const html = renderToStaticMarkup(
            React.createElement(AnalyticsConsent, {
                measurementId: 'G-SYNTHETIC1',
                onResolved: vi.fn(),
            }),
        );
        expect(html).toContain('aria-label="Preferências de privacidade"');
        expect(html).toContain('Somente essenciais');
        expect(html).toContain('Permitir Analytics');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('googletagmanager.com');
    });
    it('does not offer analytics when SiteChrome has no measurement ID', async () => {
        const { default: SiteChrome } = await import('@/components/SiteChrome');
        const html = renderToStaticMarkup(React.createElement(SiteChrome));
        expect(html).not.toContain('Permitir Analytics');
        expect(html).not.toContain('Google Analytics');
        expect(html).not.toContain('<script');
    });
    it('keeps analytics out of a private document even with a supplied ID', async () => {
        context.pathname = '/atendente';
        const { default: SiteChrome } = await import('@/components/SiteChrome');
        const html = renderToStaticMarkup(
            React.createElement(SiteChrome, { measurementId: 'G-SYNTHETIC1' }),
        );
        expect(html).not.toContain('Permitir Analytics');
        expect(html).not.toContain('<script');
    });
});
