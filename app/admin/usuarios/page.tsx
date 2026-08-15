import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent, { type RoleOption, type UserRow } from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Usuários | Painel SPM' },
};

export default async function Page() {
    const current = await requirePermission('usuarios');

    const [users, roles] = await Promise.all([
        // `select` explícito: passwordHash e os hashes de convite/redefinição
        // nunca podem sair do servidor.
        prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                initials: true,
                status: true,
                lastAccessAt: true,
                role: { select: { id: true, name: true } },
                regional: { select: { name: true } },
            },
            orderBy: { name: 'asc' },
        }),
        prisma.role.findMany({
            select: { id: true, name: true },
            orderBy: { order: 'asc' },
        }),
    ]);

    const rows: UserRow[] = users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        initials: user.initials,
        status: user.status,
        roleId: user.role.id,
        roleName: user.role.name,
        regionalName: user.regional?.name ?? 'Sem regional definida',
        lastAccess: user.lastAccessAt ? formatDateTimeShort(user.lastAccessAt) : 'Nunca acessou',
    }));

    const roleOptions: RoleOption[] = roles.map((role) => ({
        id: role.id,
        name: role.name,
    }));

    return (
        <PageContent
            users={rows}
            roles={roleOptions}
            currentUserId={current.id}
            counts={{
                total: rows.length,
                active: rows.filter((row) => row.status === 'ATIVO').length,
                pending: rows.filter((row) => row.status === 'PENDENTE').length,
                inactive: rows.filter((row) => row.status === 'INATIVO').length,
            }}
        />
    );
}
