import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent, { type EdicaoRow } from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Semana do Migrante | Painel SPM' },
};

export default async function Page() {
    await requirePermission('noticias');

    const rows = await prisma.semanaEdicao.findMany({
        orderBy: { ano: 'desc' },
        select: {
            id: true,
            ano: true,
            edicao: true,
            tema: true,
            lema: true,
            periodo: true,
            published: true,
            updatedAt: true,
            _count: { select: { materiais: true, programacao: true } },
        },
    });

    const edicoes: EdicaoRow[] = rows.map((row) => ({
        id: row.id,
        ano: row.ano,
        edicao: row.edicao,
        tema: row.tema,
        lema: row.lema,
        periodo: row.periodo,
        published: row.published,
        materiais: row._count.materiais,
        programacao: row._count.programacao,
        updatedAt: formatDateTimeShort(row.updatedAt),
    }));

    return <PageContent edicoes={edicoes} />;
}
