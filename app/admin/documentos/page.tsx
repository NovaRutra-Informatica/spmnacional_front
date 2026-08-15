import type { Metadata } from 'next';
import { formatFileSize } from '@/lib/labels';
import { requirePermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import PageContent, { type DocumentoRow, type MediaOption } from './PageContent';

export const metadata: Metadata = {
    title: { absolute: 'Documentos | Painel SPM' },
};

// A página lê o Postgres: sem isto o `docker build` (que roda sem banco) quebraria no prerender.
export const dynamic = 'force-dynamic';

export default async function Page() {
    await requirePermission('noticias');

    const [rows, arquivos] = await Promise.all([
        prisma.documento.findMany({
            orderBy: [{ category: 'asc' }, { order: 'asc' }],
            select: {
                id: true,
                title: true,
                category: true,
                meta: true,
                icon: true,
                mediaId: true,
                fileUrl: true,
                published: true,
                order: true,
            },
        }),
        prisma.media.findMany({
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: { id: true, originalName: true, size: true },
        }),
    ]);

    const documentos: DocumentoRow[] = rows.map((documento) => ({
        ...documento,
        // O formulário trabalha com string; `null` viraria "null" no input.
        fileUrl: documento.fileUrl ?? '',
    }));

    const midia: MediaOption[] = arquivos.map((arquivo) => ({
        id: arquivo.id,
        label: `${arquivo.originalName} (${formatFileSize(arquivo.size)})`,
    }));

    return <PageContent documentos={documentos} midia={midia} />;
}
