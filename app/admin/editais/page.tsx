import type { Metadata } from 'next';
import { formatFileSize, toDateInputValue } from '@/lib/labels';
import { requirePermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import PageContent, { type EditalRow, type MediaOption } from './PageContent';

export const metadata: Metadata = {
    title: { absolute: 'Editais | Painel SPM' },
};

// A página lê o Postgres: sem isto o `docker build` (que roda sem banco) quebraria no prerender.
export const dynamic = 'force-dynamic';

export default async function Page() {
    await requirePermission('editais');

    const [rows, arquivos] = await Promise.all([
        prisma.edital.findMany({
            orderBy: [{ order: 'asc' }, { publishedAt: 'desc' }],
            select: {
                id: true,
                code: true,
                slug: true,
                title: true,
                description: true,
                status: true,
                deadlineText: true,
                deadlineAt: true,
                scope: true,
                order: true,
                published: true,
                fileMediaId: true,
                fileUrl: true,
            },
        }),
        prisma.media.findMany({
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: { id: true, originalName: true, size: true },
        }),
    ]);

    // `Date` não atravessa para o cliente: vira string no formato do <input type="date">.
    const editais: EditalRow[] = rows.map((edital) => ({
        ...edital,
        deadlineAt: toDateInputValue(edital.deadlineAt),
    }));

    const midia: MediaOption[] = arquivos.map((arquivo) => ({
        id: arquivo.id,
        label: `${arquivo.originalName} (${formatFileSize(arquivo.size)})`,
    }));

    return <PageContent editais={editais} midia={midia} />;
}
