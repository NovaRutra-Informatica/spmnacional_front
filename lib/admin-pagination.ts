import type { Prisma } from '@/lib/generated/prisma/client';
import { MediaKind, PostStatus } from '@/lib/generated/prisma/enums';

export const ADMIN_PAGE_SIZE = 25;
export type AdminSearchParams = Record<string, string | string[] | undefined>;

export interface NewsFilters {
    q: string;
    status: 'todos' | PostStatus;
    categoria: string;
    page: number;
}

export interface MediaFilters {
    q: string;
    tipo: 'todos' | MediaKind;
    page: number;
}

export interface AdminPagination {
    page: number;
    totalPages: number;
    total: number;
    from: number;
    to: number;
}

function single(value: string | string[] | undefined): string {
    return typeof value === 'string' ? value : '';
}

function search(value: string | string[] | undefined): string {
    return single(value)
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 120);
}

function pageNumber(value: string | string[] | undefined): number {
    const text = single(value);
    const number = Number(text);
    return /^[1-9]\d{0,15}$/.test(text) && Number.isSafeInteger(number) ? number : 1;
}

export function newsFilters(params: AdminSearchParams): NewsFilters {
    const status = single(params.status);
    const categoria = single(params.categoria);
    return {
        q: search(params.q),
        status: Object.values(PostStatus).includes(status as PostStatus)
            ? (status as PostStatus)
            : 'todos',
        categoria: /^[A-Za-z0-9_-]{1,80}$/.test(categoria) ? categoria : 'todas',
        page: pageNumber(params.page),
    };
}

export function mediaFilters(params: AdminSearchParams): MediaFilters {
    const tipo = single(params.tipo);
    return {
        q: search(params.q),
        tipo: Object.values(MediaKind).includes(tipo as MediaKind) ? (tipo as MediaKind) : 'todos',
        page: pageNumber(params.page),
    };
}

// PostgreSQL ILIKE uses these as wildcards; the former client search was literal includes().
function literalContains(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
}

export function newsWhere(filters: NewsFilters): Prisma.PostWhereInput {
    const term = literalContains(filters.q);
    return {
        ...(filters.status !== 'todos' ? { status: filters.status } : {}),
        ...(filters.categoria !== 'todas' ? { categoryId: filters.categoria } : {}),
        ...(filters.q
            ? {
                  OR: [
                      { title: { contains: term, mode: 'insensitive' } },
                      { authorName: { contains: term, mode: 'insensitive' } },
                      {
                          tags: {
                              some: { tag: { name: { contains: term, mode: 'insensitive' } } },
                          },
                      },
                  ],
              }
            : {}),
    };
}

export function mediaWhere(filters: MediaFilters): Prisma.MediaWhereInput {
    return {
        ...(filters.tipo !== 'todos' ? { kind: filters.tipo } : {}),
        ...(filters.q
            ? { originalName: { contains: literalContains(filters.q), mode: 'insensitive' } }
            : {}),
    };
}

export function adminPagination(requestedPage: number, total: number): AdminPagination {
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    return {
        page,
        totalPages,
        total,
        from: total ? (page - 1) * ADMIN_PAGE_SIZE + 1 : 0,
        to: Math.min(page * ADMIN_PAGE_SIZE, total),
    };
}

export function adminPageHref(
    path: '/admin/noticias' | '/admin/midia',
    filters: NewsFilters | MediaFilters,
    page: number,
): string {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if ('status' in filters) {
        if (filters.status !== 'todos') params.set('status', filters.status);
        if (filters.categoria !== 'todas') params.set('categoria', filters.categoria);
    } else if (filters.tipo !== 'todos') {
        params.set('tipo', filters.tipo);
    }
    params.set('page', String(page));
    return `${path}?${params.toString()}`;
}
