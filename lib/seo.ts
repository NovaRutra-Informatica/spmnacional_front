import type { Metadata, MetadataRoute } from 'next';

export const PRODUCTION_ORIGIN = 'https://spmnacional.org.br';
export const SITE_NAME = 'SPM — Serviço Pastoral dos Migrantes';
export const SITE_DESCRIPTION =
    'Conheça o Serviço Pastoral dos Migrantes: nossa história, atuação, equipes regionais e publicações. Entre em contato para orientação ou para apoiar a rede.';

/** Assets must resolve in the running environment, including a noindex preview. */
export function publicAssetOrigin(appUrl: string | undefined): string {
    try {
        const url = new URL(appUrl ?? '');
        if (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            url.pathname === '/' &&
            !url.search &&
            !url.hash
        )
            return url.origin;
    } catch {
        // Docker builds have no runtime APP_URL.
    }
    return PRODUCTION_ORIGIN;
}

/** Somente o domínio de produção pode anunciar conteúdo para indexação. */
export function isPublicIndexingEnabled(appUrl: string | undefined): boolean {
    try {
        const url = new URL(appUrl ?? '');
        return (
            url.protocol === 'https:' &&
            ['spmnacional.org.br', 'www.spmnacional.org.br'].includes(url.hostname) &&
            !url.port &&
            !url.username &&
            !url.password &&
            url.pathname === '/' &&
            !url.search &&
            !url.hash
        );
    } catch {
        return false;
    }
}

export const PUBLIC_PAGE_SEO = {
    '/': [SITE_NAME, SITE_DESCRIPTION],
    '/quem-somos': [
        'Quem somos',
        'Conheça a missão, os objetivos e a metodologia do Serviço Pastoral dos Migrantes, organismo da Pastoral Social da CNBB.',
    ],
    '/quem-somos/historia': [
        'Nossa história',
        'Conheça a trajetória do Serviço Pastoral dos Migrantes, desde sua criação em 1985, e os caminhos da pastoral junto às comunidades migrantes.',
    ],
    '/quem-somos/estrutura': [
        'Nossa estrutura',
        'Entenda como se organizam o secretariado nacional, a coordenação e as equipes regionais do Serviço Pastoral dos Migrantes.',
    ],
    '/quem-somos/documentos': [
        'Documentos institucionais',
        'Acesse os documentos institucionais, materiais de formação e referências publicados pelo Serviço Pastoral dos Migrantes.',
    ],
    '/o-que-fazemos': [
        'O que fazemos',
        'Conheça as frentes de atuação do SPM no acolhimento, na organização das comunidades migrantes e na defesa de seus direitos.',
    ],
    '/onde-estamos': [
        'Onde estamos',
        'Encontre as equipes regionais do Serviço Pastoral dos Migrantes e consulte os contatos publicados para cada região do Brasil.',
    ],
    '/agenda': [
        'Agenda',
        'Acompanhe os encontros, atividades e eventos publicados na agenda do Serviço Pastoral dos Migrantes.',
    ],
    '/semana-do-migrante': [
        'Semana do Migrante',
        'Conheça a Semana do Migrante, consulte suas edições e acesse materiais publicados para a mobilização das comunidades.',
    ],
    '/publicacoes': [
        'Publicações',
        'Explore notícias, editais e testemunhos publicados pelo Serviço Pastoral dos Migrantes e acompanhe a atuação da rede.',
    ],
    '/publicacoes/blog': [
        'Blog e notícias',
        'Leia notícias, artigos e notas publicados pelo Serviço Pastoral dos Migrantes sobre comunidades migrantes e a atuação pastoral.',
    ],
    '/publicacoes/editais': [
        'Editais',
        'Consulte oportunidades, prazos e documentos dos editais publicados pelo Serviço Pastoral dos Migrantes.',
    ],
    '/publicacoes/testemunhos': [
        'Testemunhos',
        'Conheça relatos publicados pelo Serviço Pastoral dos Migrantes e nossa proposta de escuta e respeito às histórias de quem migra.',
    ],
    '/legislacao': [
        'Legislação',
        'Consulte referências sobre direitos de migrantes e refugiados, a Lei de Migração e a política municipal para a população imigrante.',
    ],
    '/legislacao/lei-de-migracao': [
        'Lei de Migração — Lei nº 13.445/2017',
        'Conheça princípios e direitos previstos na Lei de Migração brasileira e encontre o acesso ao texto oficial da Lei nº 13.445/2017.',
    ],
    '/legislacao/decreto-57533': [
        'Decreto Municipal nº 57.533/2016',
        'Consulte informações sobre o Decreto nº 57.533/2016, que regulamenta a política municipal para a população imigrante de São Paulo.',
    ],
    '/legislacao/lei-municipal-16478': [
        'Lei Municipal nº 16.478/2016',
        'Conheça a política municipal para a população imigrante de São Paulo instituída pela Lei nº 16.478/2016 e acesse o texto oficial.',
    ],
    '/transparencia': [
        'Transparência',
        'Acesse informações de transparência, prestação de contas e parceiros publicadas pelo Serviço Pastoral dos Migrantes.',
    ],
    '/como-ajudar': [
        'Como ajudar',
        'Conheça formas de apoiar o Serviço Pastoral dos Migrantes por meio de doações, voluntariado e articulação com sua comunidade.',
    ],
    '/fale-conosco': [
        'Fale conosco',
        'Entre em contato com o Serviço Pastoral dos Migrantes para orientação, voluntariado, parcerias ou imprensa. Veja também as perguntas frequentes.',
    ],
    '/politica-de-privacidade': [
        'Política de privacidade',
        'Saiba como o site do Serviço Pastoral dos Migrantes trata dados pessoais, guarda preferências e recebe solicitações sobre privacidade.',
    ],
    '/sobre-as-traducoes': [
        'Sobre as traduções',
        'Entenda como funcionam as traduções automáticas do site do SPM, suas limitações e como consultar o conteúdo original em português.',
    ],
} as const;

export type PublicPagePath = keyof typeof PUBLIC_PAGE_SEO;

/** Metadados completos por página: os campos Open Graph não são herdados por mesclagem. */
export function pageMetadata(path: PublicPagePath): Metadata {
    const [title, description] = PUBLIC_PAGE_SEO[path];
    return contentMetadata(path, title, description);
}

export function contentMetadata(path: string, title: string, description: string): Metadata {
    const publicPath =
        path.startsWith('/') && !path.startsWith('//')
            ? new URL(path, PRODUCTION_ORIGIN).pathname
            : '/';
    const canonical = `${PRODUCTION_ORIGIN}${publicPath}`;
    const image = { url: '/opengraph-image', width: 1200, height: 630, alt: SITE_NAME };
    return {
        title: path === '/' ? { absolute: SITE_NAME } : title,
        description,
        alternates: { canonical },
        openGraph: {
            type: 'website',
            locale: 'pt_BR',
            siteName: SITE_NAME,
            title,
            description,
            url: canonical,
            images: [image],
        },
        twitter: { card: 'summary_large_image', title, description, images: [image] },
    };
}

export function robotsPolicy(appUrl: string | undefined): MetadataRoute.Robots {
    if (!isPublicIndexingEnabled(appUrl)) {
        return { rules: { userAgent: '*', disallow: '/' } };
    }
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            // Arquivos editoriais públicos continuam rastreáveis em /api/arquivos.
            disallow: [
                '/admin',
                '/atendente',
                '/convite',
                '/api/auth',
                '/api/admin',
                '/api/cron',
                '/api/health',
                '/fale-conosco/obrigado',
                '/newsletter/confirmar',
            ],
        },
        sitemap: `${PRODUCTION_ORIGIN}/sitemap.xml`,
        host: PRODUCTION_ORIGIN,
    };
}
