import type { Metadata } from 'next';
import { listDocumentos } from '@/lib/server/queries';
import PageContent, { type DocumentoItem } from './PageContent';

export const metadata: Metadata = {
    title: 'Documentos',
};

// A página lê o Postgres: sem isto o `docker build` (que roda sem banco) quebraria no prerender.
export const dynamic = 'force-dynamic';

export default async function Page() {
    const rows = await listDocumentos();

    // Só o que a tela usa atravessa para o cliente — nada de `Date` cru nem de campos internos.
    const documentos: DocumentoItem[] = rows.map((documento) => ({
        id: documento.id,
        title: documento.title,
        category: documento.category,
        meta: documento.meta,
        icon: documento.icon,
        fileUrl: documento.fileUrl,
    }));

    return <PageContent documentos={documentos} />;
}
