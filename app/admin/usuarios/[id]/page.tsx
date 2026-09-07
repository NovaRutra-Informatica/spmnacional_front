import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent, { type RegionalOption, type RoleOption } from './PageContent';
import { ADMIN_ROLE_KEY, escopoUsuarios, isAdminGeral } from '../politica';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Editar usuário | Painel SPM' },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const current = await requirePermission('usuarios');
    const { id } = await params;
    const adminGeral = isAdminGeral(current);

    // `select` explícito: nenhum hash de senha ou de token sai do servidor.
    const user = await prisma.user.findFirst({
        where: { id, ...escopoUsuarios(current) },
        select: {
            id: true,
            name: true,
            email: true,
            initials: true,
            status: true,
            roleId: true,
            regionalId: true,
            lastAccessAt: true,
            createdAt: true,
            inviteExpiresAt: true,
            role: { select: { name: true } },
        },
    });

    if (!user) notFound();

    const [roles, regionais, sessoesAtivas] = await Promise.all([
        prisma.role.findMany({
            where: adminGeral ? {} : { key: { not: ADMIN_ROLE_KEY } },
            select: { id: true, name: true, description: true },
            orderBy: { order: 'asc' },
        }),
        prisma.regional.findMany({
            where: adminGeral
                ? { active: true }
                : current.regionalId
                  ? { id: current.regionalId }
                  : { id: { in: [] } },
            select: { id: true, name: true },
            orderBy: [{ region: 'asc' }, { order: 'asc' }],
        }),
        prisma.session.count({
            where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        }),
    ]);

    const roleOptions: RoleOption[] = roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
    }));

    const regionalOptions: RegionalOption[] = regionais.map((regional) => ({
        id: regional.id,
        name: regional.name,
    }));

    return (
        <PageContent
            user={{
                id: user.id,
                name: user.name,
                email: user.email,
                initials: user.initials,
                status: user.status,
                roleId: user.roleId,
                roleName: user.role.name,
                regionalId: user.regionalId ?? '',
                lastAccess: user.lastAccessAt
                    ? formatDateTimeShort(user.lastAccessAt)
                    : 'Nunca acessou',
                createdAt: formatDateTimeShort(user.createdAt),
                inviteExpiresAt: user.inviteExpiresAt
                    ? formatDateTimeShort(user.inviteExpiresAt)
                    : null,
            }}
            roles={roleOptions}
            regionais={regionalOptions}
            sessoesAtivas={sessoesAtivas}
            isSelf={user.id === current.id}
            canManagePermissions={adminGeral}
            allowNoRegional={adminGeral}
        />
    );
}
