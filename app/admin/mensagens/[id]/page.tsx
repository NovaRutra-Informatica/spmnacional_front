import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Mensagem | Painel SPM' },
};

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
    const [user, { id }] = await Promise.all([requirePermission('atendimentos'), params]);

    const message = await prisma.contactMessage.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            city: true,
            subject: true,
            language: true,
            message: true,
            status: true,
            internalNote: true,
            respondedAt: true,
            createdAt: true,
            updatedAt: true,
            ip: true,
            userAgent: true,
            assignedToId: true,
            assignedTo: { select: { name: true } },
        },
    });

    if (!message) {
        notFound();
    }

    // O responsável já atribuído entra na lista mesmo se a conta tiver sido
    // desativada; fora dela, o <select> cairia em "sem responsável" e o próximo
    // salvamento apagaria a atribuição sem ninguém perceber.
    const responsavelAtual = message.assignedToId;
    const users = await prisma.user.findMany({
        where: responsavelAtual
            ? { OR: [{ status: 'ATIVO' }, { id: responsavelAtual }] }
            : { status: 'ATIVO' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, status: true },
    });

    // Abrir a mensagem é acesso a dado pessoal de terceiro: fica registrado.
    await recordAudit({
        action: 'Mensagem de contato aberta',
        target: `${message.subject} — ${message.name}`,
        userId: user.id,
        actorLabel: user.email,
        metadata: { mensagemId: message.id },
    });

    return (
        <PageContent
            message={{
                id: message.id,
                name: message.name,
                email: message.email,
                phone: message.phone,
                city: message.city,
                subject: message.subject,
                language: message.language,
                body: message.message,
                status: message.status,
                internalNote: message.internalNote ?? '',
                assignedToId: message.assignedToId ?? '',
                assignedToName: message.assignedTo?.name ?? null,
                respondedAt: message.respondedAt ? formatDateTimeShort(message.respondedAt) : null,
                createdAt: formatDateTimeShort(message.createdAt),
                updatedAt: formatDateTimeShort(message.updatedAt),
                ip: message.ip,
                userAgent: message.userAgent,
            }}
            users={users.map((option) => ({
                id: option.id,
                name: option.name,
                email: option.email,
                inactive: option.status !== 'ATIVO',
            }))}
        />
    );
}
