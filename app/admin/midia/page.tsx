import type { Metadata } from 'next';
import { mediaFilters, type AdminSearchParams } from '@/lib/admin-pagination';
import { listAdminMedia } from '@/lib/server/admin-listing';
import { requirePermission } from '@/lib/server/auth';
import { formatDateTimeShort, formatFileSize } from '@/lib/labels';
import PageContent, { type ArquivoItem } from './PageContent';

// A biblioteca é lida do banco a cada acesso.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Biblioteca de mídia | Painel SPM' },
};

export default async function Page({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
    await requirePermission('midia');
    const filtros = mediaFilters(await searchParams);
    const { arquivos, pagination, contagens } = await listAdminMedia(filtros);

    const itens: ArquivoItem[] = arquivos.map((arquivo) => ({
        id: arquivo.id,
        name: arquivo.originalName,
        url: arquivo.url,
        kind: arquivo.kind,
        size: formatFileSize(arquivo.size),
        uploadedAt: formatDateTimeShort(arquivo.createdAt),
        usos:
            arquivo._count.posts +
            arquivo._count.editais +
            arquivo._count.documentos +
            arquivo._count.materiais,
    }));

    return (
        <PageContent
            arquivos={itens}
            filtros={filtros}
            pagination={pagination}
            contagens={contagens}
        />
    );
}
