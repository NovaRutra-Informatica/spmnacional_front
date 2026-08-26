import type { Metadata } from 'next';
import { requirePermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent, { type MessageRow } from './PageContent';

// Lista lida direto do Postgres a cada acesso.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Mensagens | Painel SPM' },
};

export default async function Page() {
    await requirePermission('atendimentos');

    const [rows, statusRows] = await Promise.all([
        prisma.contactMessage.findMany({
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: {
                id: true,
                name: true,
                email: true,
                city: true,
                subject: true,
                message: true,
                status: true,
                respondedAt: true,
                createdAt: true,
                assignedTo: { select: { name: true } },
            },
        }),
        prisma.contactMessage.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const countByStatus = (status: string): number =>
        statusRows.find((row) => row.status === status)?._count._all ?? 0;

    const messages: MessageRow[] = rows.map((row) => {
        // Só uma prévia curta na listagem — o texto completo fica na tela da mensagem.
        const texto = row.message.replace(/\s+/g, ' ').trim();
        const preview = texto.length > 120 ? `${texto.slice(0, 120)}…` : texto;

        return {
            id: row.id,
            name: row.name,
            email: row.email,
            city: row.city,
            subject: row.subject,
            preview,
            status: row.status,
            assignedTo: row.assignedTo?.name ?? null,
            respondedAt: row.respondedAt ? formatDateTimeShort(row.respondedAt) : null,
            createdAt: formatDateTimeShort(row.createdAt),
        };
    });

    return (
        <PageContent
            messages={messages}
            counts={{
                novas: countByStatus('NOVA'),
                emAtendimento: countByStatus('EM_ATENDIMENTO'),
                respondidas: countByStatus('RESPONDIDA'),
                arquivadas: countByStatus('ARQUIVADA'),
            }}
        />
    );
}
