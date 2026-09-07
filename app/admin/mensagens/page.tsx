import type { Metadata } from 'next';
import { requirePermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { formatDateTimeShort } from '@/lib/labels';
import { decryptSensitiveOrLegacy } from '@/lib/server/crypto';
import PageContent, { type MessageRow } from './PageContent';
import { escopoMensagens } from './politica';

// Lista lida direto do Postgres a cada acesso.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Mensagens | Painel SPM' },
};

export default async function Page() {
    const user = await requirePermission('atendimentos');
    const escopo = escopoMensagens(user);

    const [rows, statusRows] = await Promise.all([
        prisma.contactMessage.findMany({
            where: escopo,
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
                encryptedAt: true,
                assignedTo: { select: { name: true } },
            },
        }),
        prisma.contactMessage.groupBy({
            by: ['status'],
            where: escopo,
            _count: { _all: true },
        }),
    ]);

    const countByStatus = (status: string): number =>
        statusRows.find((row) => row.status === status)?._count._all ?? 0;

    const messages: MessageRow[] = rows.map((row) => {
        const name = decryptSensitiveOrLegacy(row.name, row.encryptedAt) ?? 'Dado indisponível';
        const email = decryptSensitiveOrLegacy(row.email, row.encryptedAt) ?? 'Dado indisponível';
        const city = decryptSensitiveOrLegacy(row.city, row.encryptedAt);
        const body =
            decryptSensitiveOrLegacy(row.message, row.encryptedAt) ?? 'Conteúdo indisponível';
        // Só uma prévia curta na listagem — o texto completo fica na tela da mensagem.
        const texto = body.replace(/\s+/g, ' ').trim();
        const preview = texto.length > 120 ? `${texto.slice(0, 120)}…` : texto;

        return {
            id: row.id,
            name,
            email,
            city,
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
