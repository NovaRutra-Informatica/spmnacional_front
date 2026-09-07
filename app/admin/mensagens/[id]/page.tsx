import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { decryptSensitiveOrLegacy } from '@/lib/server/crypto';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent from './PageContent';
import { escopoMensagens, podeAtribuirMensagens } from '../politica';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Mensagem | Painel SPM' },
};

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
    const [user, { id }] = await Promise.all([requirePermission('atendimentos'), params]);

    const message = await prisma.contactMessage.findFirst({
        where: { id, ...escopoMensagens(user) },
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
            encryptedAt: true,
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
    const podeAtribuir = podeAtribuirMensagens(user);
    const users = await prisma.user.findMany({
        where: podeAtribuir
            ? {
                  OR: [
                      {
                          status: 'ATIVO',
                          role: { permissions: { some: { permissionKey: 'atendimentos' } } },
                      },
                      ...(responsavelAtual ? [{ id: responsavelAtual }] : []),
                  ],
              }
            : { id: user.id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, status: true },
    });

    // Abrir a mensagem é acesso a dado pessoal de terceiro: fica registrado.
    await recordAudit({
        action: 'Mensagem de contato aberta',
        target: `Mensagem ${message.id}`,
        userId: user.id,
        actorLabel: user.email,
        metadata: { mensagemId: message.id },
    });

    const readSensitive = (value: string | null): string | null =>
        decryptSensitiveOrLegacy(value, message.encryptedAt);

    return (
        <PageContent
            message={{
                id: message.id,
                name: readSensitive(message.name) ?? 'Dado indisponível',
                email: readSensitive(message.email) ?? '',
                phone: readSensitive(message.phone),
                city: readSensitive(message.city),
                subject: message.subject,
                language: message.language,
                body: readSensitive(message.message) ?? 'Conteúdo indisponível',
                status: message.status,
                internalNote: readSensitive(message.internalNote) ?? '',
                assignedToId: message.assignedToId ?? '',
                assignedToName: message.assignedTo?.name ?? null,
                respondedAt: message.respondedAt ? formatDateTimeShort(message.respondedAt) : null,
                createdAt: formatDateTimeShort(message.createdAt),
                updatedAt: formatDateTimeShort(message.updatedAt),
            }}
            users={users.map((option) => ({
                id: option.id,
                name: option.name,
                email: option.email,
                inactive: option.status !== 'ATIVO',
            }))}
            canAssign={podeAtribuir}
        />
    );
}
