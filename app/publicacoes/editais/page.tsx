import type { Metadata } from 'next';
import { listEditais } from '@/lib/server/queries';
import PageContent, { type EditalItem } from './PageContent';

export const metadata: Metadata = { title: 'Editais' };

// A página lê o Postgres: sem isto o `docker build` (que roda sem banco) quebraria no prerender.
export const dynamic = 'force-dynamic';

export default async function EditaisPage() {
    const rows = await listEditais();

    // Só o que a tela usa atravessa para o cliente — nada de `Date` cru nem de campos internos.
    const editais: EditalItem[] = rows.map((edital) => ({
        id: edital.id,
        code: edital.code,
        title: edital.title,
        description: edital.description,
        status: edital.status,
        deadlineText: edital.deadlineText,
        scope: edital.scope,
        fileUrl: edital.fileUrl,
    }));

    return <PageContent editais={editais} />;
}
