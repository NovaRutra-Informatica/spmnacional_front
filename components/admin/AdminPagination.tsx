import Link from 'next/link';
import {
    adminPageHref,
    type AdminPagination as Pagination,
    type MediaFilters,
    type NewsFilters,
} from '@/lib/admin-pagination';

export default function AdminPagination({
    path,
    filters,
    pagination,
}: {
    path: '/admin/noticias' | '/admin/midia';
    filters: NewsFilters | MediaFilters;
    pagination: Pagination;
}) {
    return (
        <nav className="atoolbar" aria-label="Paginação da listagem">
            {pagination.page > 1 ? (
                <Link
                    className="abtn abtn--ghost"
                    prefetch={false}
                    href={adminPageHref(path, filters, pagination.page - 1)}
                    rel="prev"
                >
                    Página anterior
                </Link>
            ) : (
                <span className="abtn abtn--ghost" aria-disabled="true">
                    Página anterior
                </span>
            )}
            <span className="atoolbar__count" aria-current="page">
                Página {pagination.page} de {pagination.totalPages}
            </span>
            {pagination.page < pagination.totalPages ? (
                <Link
                    className="abtn abtn--ghost"
                    prefetch={false}
                    href={adminPageHref(path, filters, pagination.page + 1)}
                    rel="next"
                >
                    Próxima página
                </Link>
            ) : (
                <span className="abtn abtn--ghost" aria-disabled="true">
                    Próxima página
                </span>
            )}
        </nav>
    );
}
