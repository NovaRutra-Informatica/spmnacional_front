import 'server-only';
import { prisma } from './db';
import {
    ADMIN_PAGE_SIZE,
    adminPagination,
    mediaWhere,
    newsWhere,
    type MediaFilters,
    type NewsFilters,
} from '@/lib/admin-pagination';

/** Authorization stays in the page, before any listing query. No cross-request cache. */
export async function listAdminNews(filters: NewsFilters) {
    const where = newsWhere(filters);
    const [groups, categorias, filteredTotal] = await Promise.all([
        prisma.post.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.category.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true } }),
        Object.keys(where).length ? prisma.post.count({ where }) : Promise.resolve(null),
    ]);
    const globalTotal = groups.reduce((sum, group) => sum + group._count._all, 0);
    const pagination = adminPagination(filters.page, filteredTotal ?? globalTotal);
    const posts = await prisma.post.findMany({
        where,
        take: ADMIN_PAGE_SIZE,
        skip: (pagination.page - 1) * ADMIN_PAGE_SIZE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            slug: true,
            title: true,
            coverUrl: true,
            status: true,
            publishedAt: true,
            highlight: true,
            views: true,
            authorName: true,
            category: { select: { id: true, name: true } },
        },
    });
    const count = (status: string) =>
        groups.find((group) => group.status === status)?._count._all ?? 0;
    return {
        posts,
        categorias,
        pagination,
        contagens: {
            publicadas: count('PUBLICADO'),
            rascunhos: count('RASCUNHO'),
            revisao: count('REVISAO'),
            agendadas: count('AGENDADO'),
        },
    };
}

export async function listAdminMedia(filters: MediaFilters) {
    const where = mediaWhere(filters);
    const [groups, filteredTotal] = await Promise.all([
        prisma.media.groupBy({ by: ['kind'], _count: { _all: true } }),
        Object.keys(where).length ? prisma.media.count({ where }) : Promise.resolve(null),
    ]);
    const globalTotal = groups.reduce((sum, group) => sum + group._count._all, 0);
    const pagination = adminPagination(filters.page, filteredTotal ?? globalTotal);
    const arquivos = await prisma.media.findMany({
        where,
        take: ADMIN_PAGE_SIZE,
        skip: (pagination.page - 1) * ADMIN_PAGE_SIZE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            originalName: true,
            url: true,
            kind: true,
            size: true,
            createdAt: true,
            _count: { select: { posts: true, editais: true, documentos: true, materiais: true } },
        },
    });
    const count = (kind: string) => groups.find((group) => group.kind === kind)?._count._all ?? 0;
    return {
        arquivos,
        pagination,
        contagens: { total: globalTotal, imagens: count('IMAGEM'), documentos: count('DOCUMENTO') },
    };
}
