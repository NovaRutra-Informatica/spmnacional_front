import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { formatDateTimeShort, formatFileSize } from '@/lib/labels';
import PageContent, { type ArquivoItem } from './PageContent';

// A biblioteca é lida do banco a cada acesso.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Biblioteca de mídia | Painel SPM' },
};

export default async function Page() {
    await requirePermission('midia');

    const arquivos = await prisma.media.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            originalName: true,
            url: true,
            kind: true,
            size: true,
            createdAt: true,
            // Contagem de vínculos: é ela que decide se a exclusão pode acontecer.
            _count: { select: { posts: true, editais: true, documentos: true, materiais: true } },
        },
    });

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

    return <PageContent arquivos={itens} />;
}
