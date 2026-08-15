import type { Metadata } from 'next';
import { requirePermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import PageContent, { type TestemunhoRow } from './PageContent';

export const metadata: Metadata = {
    title: { absolute: 'Testemunhos | Painel SPM' },
};

// A página lê o Postgres: sem isto o `docker build` (que roda sem banco) quebraria no prerender.
export const dynamic = 'force-dynamic';

export default async function Page() {
    await requirePermission('noticias');

    const rows = await prisma.testemunho.findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        select: {
            id: true,
            text: true,
            personName: true,
            origin: true,
            initials: true,
            consent: true,
            consentNote: true,
            anonymized: true,
            featured: true,
            published: true,
            order: true,
        },
    });

    const testemunhos: TestemunhoRow[] = rows.map((testemunho) => ({
        ...testemunho,
        // O formulário trabalha com string; `null` viraria "null" no textarea.
        consentNote: testemunho.consentNote ?? '',
    }));

    return <PageContent testemunhos={testemunhos} />;
}
