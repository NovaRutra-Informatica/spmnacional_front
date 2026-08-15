import 'server-only';

import { prisma } from './db';

/**
 * Camada de leitura do site público.
 *
 * Todas as páginas públicas passam por aqui, para que o filtro de publicação
 * (status, data, flag) fique em um lugar só e não seja esquecido em nenhuma
 * tela.
 */

const now = () => new Date();

// ---------------------------------------------------------
// Notícias
// ---------------------------------------------------------

const postListSelect = {
    id: true,
    slug: true,
    title: true,
    excerpt: true,
    coverUrl: true,
    authorName: true,
    publishedAt: true,
    highlight: true,
    views: true,
    category: { select: { name: true, slug: true } },
} as const;

export async function listPublishedPosts(options: { take?: number; skip?: number } = {}) {
    return prisma.post.findMany({
        where: { status: 'PUBLICADO', publishedAt: { lte: now() } },
        orderBy: [{ publishedAt: 'desc' }],
        select: postListSelect,
        take: options.take,
        skip: options.skip,
    });
}

export async function countPublishedPosts(): Promise<number> {
    return prisma.post.count({
        where: { status: 'PUBLICADO', publishedAt: { lte: now() } },
    });
}

export async function getFeaturedPost() {
    return prisma.post.findFirst({
        where: { status: 'PUBLICADO', publishedAt: { lte: now() }, highlight: true },
        orderBy: { publishedAt: 'desc' },
        select: postListSelect,
    });
}

export async function getPostBySlug(slug: string) {
    return prisma.post.findFirst({
        where: { slug, status: 'PUBLICADO', publishedAt: { lte: now() } },
        include: {
            category: { select: { name: true, slug: true } },
            tags: { include: { tag: { select: { name: true, slug: true } } } },
        },
    });
}

export async function listPublishedPostSlugs() {
    return prisma.post.findMany({
        where: { status: 'PUBLICADO', publishedAt: { lte: now() } },
        select: { slug: true, updatedAt: true },
        orderBy: { publishedAt: 'desc' },
    });
}

export async function listCategories() {
    return prisma.category.findMany({ orderBy: { order: 'asc' } });
}

/** Contador de leitura — falha em silêncio para nunca quebrar a página. */
export async function incrementPostViews(id: string): Promise<void> {
    await prisma.post
        .update({ where: { id }, data: { views: { increment: 1 } } })
        .catch(() => undefined);
}

// ---------------------------------------------------------
// Editais, testemunhos e documentos
// ---------------------------------------------------------

export async function listEditais() {
    return prisma.edital.findMany({
        where: { published: true },
        orderBy: [{ status: 'asc' }, { order: 'asc' }, { publishedAt: 'desc' }],
    });
}

export async function listTestemunhos() {
    return prisma.testemunho.findMany({
        where: { published: true },
        orderBy: [{ order: 'asc' }, { publishedAt: 'desc' }],
    });
}

export async function getFeaturedTestemunho() {
    return prisma.testemunho.findFirst({
        where: { published: true, featured: true },
        orderBy: { order: 'asc' },
    });
}

export async function listDocumentos() {
    return prisma.documento.findMany({
        where: { published: true },
        orderBy: [{ category: 'asc' }, { order: 'asc' }],
    });
}

// ---------------------------------------------------------
// Regionais
// ---------------------------------------------------------

export async function listRegionais() {
    return prisma.regional.findMany({
        where: { active: true },
        orderBy: [{ region: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    });
}

export async function countRegionaisPorUf(): Promise<number> {
    const rows = await prisma.regional.findMany({
        where: { active: true },
        select: { uf: true },
        distinct: ['uf'],
    });
    return rows.length;
}

// ---------------------------------------------------------
// Semana do Migrante
// ---------------------------------------------------------

export async function listSemanaEdicoes() {
    return prisma.semanaEdicao.findMany({
        where: { published: true },
        orderBy: { ano: 'desc' },
        include: { _count: { select: { materiais: true } } },
    });
}

export async function getSemanaEdicao(ano: number) {
    return prisma.semanaEdicao.findFirst({
        where: { ano, published: true },
        include: {
            materiais: { orderBy: { order: 'asc' } },
            programacao: { orderBy: { order: 'asc' } },
        },
    });
}

export async function listSemanaAnos(): Promise<number[]> {
    const rows = await prisma.semanaEdicao.findMany({
        where: { published: true },
        select: { ano: true },
        orderBy: { ano: 'desc' },
    });
    return rows.map((row) => row.ano);
}

// ---------------------------------------------------------
// Agenda
// ---------------------------------------------------------

export async function listAgendaEvents(options: { past?: boolean; take?: number } = {}) {
    const reference = new Date();
    reference.setHours(0, 0, 0, 0);

    return prisma.agendaEvent.findMany({
        where: {
            published: true,
            ...(options.past ? { endsAt: { lt: reference } } : { endsAt: { gte: reference } }),
        },
        orderBy: { startsAt: options.past ? 'desc' : 'asc' },
        take: options.take,
    });
}

// ---------------------------------------------------------
// Configurações do site
// ---------------------------------------------------------

export interface SiteSettings {
    siteName: string;
    tagline: string;
    description: string;
    address: string;
    city: string;
    zip: string;
    phone: string;
    email: string;
    hours: string;
    instagram: string;
    facebook: string;
    youtube: string;
    whatsapp: string;
    showStickyDonate: boolean;
    showNewsletter: boolean;
    showCookieNotice: boolean;
    maintenance: boolean;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
    siteName: 'SPM — Serviço Pastoral dos Migrantes',
    tagline: 'Acolher, Proteger, Promover e Integrar.',
    description:
        'Organismo da Pastoral Social da CNBB que, desde 1985, acolhe, organiza e defende os direitos de migrantes e refugiados em todo o Brasil.',
    address: 'Rua Caiambé, 126 — Vila Monumento / Ipiranga',
    city: 'São Paulo — SP',
    zip: '04264-060',
    phone: '(11) 2063-7064',
    email: 'spm.nac@terra.com.br',
    hours: 'Segunda a sexta, das 9h às 17h',
    instagram: 'https://www.instagram.com/pastoraldosmigrantes',
    facebook: 'https://www.facebook.com/pastoraldosmigrantes',
    youtube: '',
    whatsapp: '',
    showStickyDonate: true,
    showNewsletter: true,
    showCookieNotice: true,
    maintenance: false,
};

export const SITE_SETTINGS_KEY = 'site';

export async function getSiteSettings(): Promise<SiteSettings> {
    const row = await prisma.siteSetting
        .findUnique({ where: { key: SITE_SETTINGS_KEY } })
        .catch(() => null);

    if (!row?.value || typeof row.value !== 'object') {
        return DEFAULT_SITE_SETTINGS;
    }

    return { ...DEFAULT_SITE_SETTINGS, ...(row.value as Partial<SiteSettings>) };
}

// ---------------------------------------------------------
// Números da home
// ---------------------------------------------------------

export async function getHomeStats() {
    const [ufs, edicoes, posts] = await Promise.all([
        countRegionaisPorUf(),
        prisma.semanaEdicao.count({ where: { published: true } }),
        countPublishedPosts(),
    ]);

    return { ufs, edicoes, posts };
}
