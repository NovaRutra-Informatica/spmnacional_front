import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { serializeJsonLd } from '@/lib/structured-data';

vi.mock('@/components/TranslationProvider', () => ({
    TranslatedContent: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    usePublicTranslation: () => ({ locale: 'pt' }),
}));
vi.mock('@/components/PublicTranslation', () => ({
    default: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
}));
vi.mock('@/components/LocalizedLink', () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
        React.createElement('a', { href, ...props }, children),
}));
vi.mock('next/image', () => ({
    default: (props: Record<string, unknown>) => {
        const imageProps = { ...props };
        delete imageProps.fill;
        delete imageProps.priority;
        return React.createElement('img', imageProps);
    },
}));
vi.mock('@/components/Animate', () => ({
    default: ({ children, as = 'div', ...props }: { children: React.ReactNode; as?: string }) =>
        React.createElement(as, props, children),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/app/fale-conosco/actions', () => ({ enviarMensagem: vi.fn() }));
vi.mock('@/lib/server/audit', () => ({ recordAudit: async () => undefined }));
vi.mock('@/lib/server/newsletter', () => ({
    confirmNewsletterToken: async () => ({
        id: 'synthetic-subscriber',
        email: 'synthetic@example.test',
    }),
}));
vi.mock('@/lib/server/queries', () => ({
    listPublishedPosts: async () => [],
    getHomeStats: async () => ({ ufs: 0, edicoes: 0, posts: 0 }),
}));
vi.mock('@/components/StructuredData', () => ({ default: () => null }));
vi.mock('@/app/newsletter/actions', () => ({ inscrever: vi.fn() }));

// Next uses automatic JSX; Vitest's TSX transform follows the repository's preserve setting.
beforeAll(() => {
    vi.stubGlobal('React', React);
});

describe('public navigation and recovery UI', () => {
    it('exposes a labelled breadcrumb and one current page', async () => {
        const { default: PageHero } = await import('@/components/PageHero');
        const html = renderToStaticMarkup(
            React.createElement(PageHero, {
                title: 'Documentos',
                crumbs: [{ label: 'Quem somos', link: '/quem-somos' }, { label: 'Documentos' }],
            }),
        );
        expect(html).toContain('<nav aria-label="Caminho da página">');
        expect(html).toContain('<ol class="breadcrumb">');
        expect(html.match(/aria-current="page"/g)).toHaveLength(1);
        expect(html).toContain('href="/quem-somos"');
        expect(html).toContain('class="sep" aria-hidden="true"');
    });
    it('has one H1 and a visible first-slide contact CTA', async () => {
        const { default: HomeHeroCarousel } = await import('@/components/HomeHeroCarousel');
        const html = renderToStaticMarkup(React.createElement(HomeHeroCarousel));
        expect(html.match(/<h1>/g)).toHaveLength(1);
        expect(html.match(/<h2>/g)).toHaveLength(2);
        expect(html).toContain('href="/fale-conosco#formulario"');
        expect(html).toContain('Preciso de orientação');
        expect(html).toContain('acolhimento-comunitario.webp');
    });
    it('offers useful recovery links with a plain 404 message', async () => {
        const { default: NotFound, metadata } = await import('@/app/not-found');
        const html = renderToStaticMarkup(React.createElement(NotFound));
        expect(html).toContain('Página não encontrada');
        for (const href of ['/', '/fale-conosco', '/quem-somos', '/publicacoes/blog'])
            expect(html).toContain(`href="${href}"`);
        expect(metadata.robots).toEqual({ index: false, follow: false });
        expect(html).not.toContain('às vezes, com pessoas');
    });
    it('shows a minimal confirmation without visitor details or a response SLA', async () => {
        const { default: ThankYou, metadata } = await import('@/app/fale-conosco/obrigado/page');
        const html = renderToStaticMarkup(React.createElement(ThankYou));
        expect(html).toContain('Responderemos o mais breve possível.');
        expect(html).not.toMatch(/dias úteis|Mensagem #|protocolo/i);
        expect(html).toContain('href="/onde-estamos"');
        expect(metadata.robots).toEqual({ index: false, follow: false });
    });
    it('confirms newsletter signup without promising an unconfirmed mailing frequency', async () => {
        const { default: Confirmation } = await import('@/app/newsletter/confirmar/page');
        const html = renderToStaticMarkup(
            await Confirmation({
                searchParams: Promise.resolve({ token: 'synthetic-confirmation-token' }),
            }),
        ).replace(/\s+/g, ' ');
        expect(html).toContain('Inscrição confirmada');
        expect(html).toContain('Você pode cancelar quando quiser.');
        expect(html).toContain('href="/publicacoes/blog"');
        expect(html).not.toMatch(/mensalmente|semanalmente|diariamente/i);
    });
    it('offers the home newsletter without promising an unconfirmed mailing frequency', async () => {
        const { default: Home } = await import('@/app/page');
        const html = renderToStaticMarkup(await Home()).replace(/\s+/g, ' ');
        expect(html).toContain('Receba uma seleção de notícias, editais e materiais da nossa rede.');
        expect(html).toContain('name="email"');
        expect(html).not.toMatch(/seleção mensal|mensalmente|semanalmente|diariamente/i);
    });
    it('keeps the unpopulated case section honest and excluded from indexing', async () => {
        const { default: CaseStudies, generateMetadata } =
            await import('@/app/publicacoes/estudos-de-caso/page');
        const html = renderToStaticMarkup(React.createElement(CaseStudies));
        expect(html).toContain('Nenhum estudo de caso publicado no momento');
        expect(html).toContain('href="/publicacoes/blog"');
        expect(html).not.toContain('Caso sintético');
        expect(generateMetadata().robots).toEqual({ index: false, follow: true });
    });
    it('describes retention from the last update, scheduled purge and backup retention', async () => {
        const { default: Privacy } = await import('@/app/politica-de-privacidade/page');
        const html = renderToStaticMarkup(React.createElement(Privacy)).replace(/\s+/g, ' ');
        expect(html).toContain('24 meses desde a última atualização');
        expect(html).toContain('acontece quando essa rotina é executada');
        expect(html).toContain('cópias de segurança seguem retenção de 30 dias');
        expect(html).toContain('não elimina imediatamente os dados dessas cópias');
        expect(html).not.toContain('mantidas por até 24 meses');
    });
    it('escapes editorial HTML in JSON-LD without changing its decoded data', () => {
        const value = { text: '</script><script>alert(1)</script>\u2028\u2029' };
        const json = serializeJsonLd(value);
        expect(json).not.toContain('<');
        expect(JSON.parse(json)).toEqual(value);
    });
    it('renders contact fields, accessible FAQ controls and an explicit external map link', async () => {
        const { default: Contact } = await import('@/app/fale-conosco/PageContent');
        const html = renderToStaticMarkup(React.createElement(Contact));
        expect(html).toContain('id="formulario"');
        expect(html).toContain('autoComplete="name"');
        expect(html).toContain('autoComplete="email"');
        expect(html).toContain('aria-controls="faq-answer-0"');
        expect(html).toContain('aria-labelledby="faq-question-0" hidden=""');
        expect(html).toContain('https://www.google.com/maps/dir/?');
        expect(html).not.toContain('<iframe');
        expect(html).not.toContain('href="#"');
        expect(html).not.toContain('5 dias úteis');
    });
    it('loads institutional photographs lazily and labels the illustrative house honestly', async () => {
        const { default: History } = await import('@/app/quem-somos/historia/page');
        const { default: Structure } = await import('@/app/quem-somos/estrutura/page');
        const history = renderToStaticMarkup(React.createElement(History));
        const structure = renderToStaticMarkup(React.createElement(Structure));
        expect(history).toContain('src="/assets/exemplo-migrantes.jpeg"');
        expect(history).toContain('src="/assets/padre-alfredinho.png"');
        expect(history.match(/loading="lazy"/g)).toHaveLength(2);
        expect(structure).toContain('src="/assets/house.jpg"');
        expect(structure).toContain(
            '<figcaption class="illustrative-caption">Imagem ilustrativa</figcaption>',
        );
    });
});
