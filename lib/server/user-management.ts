import 'server-only';

import type { Prisma } from '@/lib/generated/prisma/client';
import type { SessionUser } from './auth';
import { ActionInputError, PermissionError } from './actions';
import { prisma } from './db';
import { ADMIN_ROLE_KEY, escopoUsuarios } from '@/app/admin/usuarios/politica';

export async function withProtectedUserMutation<T>(
    actor: SessionUser,
    id: string,
    work: (
        tx: Prisma.TransactionClient,
        currentActor: SessionUser,
        target: {
            id: string;
            roleId: string;
            status: string;
            regionalId: string | null;
            role: { key: string };
        },
    ) => Promise<T>,
): Promise<T> {
    return prisma.$transaction(
        async (tx) => {
            // Shared by removal, deactivation and role changes. The DB releases this
            // lock on commit/rollback; two admins cannot concurrently remove each other.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'SPM:activeadmins'}, 0))::text AS locked`;
            const fresh = await tx.user.findUnique({
                where: { id: actor.id },
                select: {
                    id: true,
                    email: true,
                    status: true,
                    regionalId: true,
                    role: {
                        select: {
                            id: true,
                            key: true,
                            name: true,
                            permissions: { select: { permissionKey: true } },
                        },
                    },
                },
            });
            const permissions = fresh?.role.permissions.map((value) => value.permissionKey) ?? [];
            if (
                !fresh ||
                fresh.status !== 'ATIVO' ||
                fresh.email !== actor.email ||
                !permissions.includes('usuarios')
            )
                throw new PermissionError('usuarios');
            const currentActor: SessionUser = {
                ...actor,
                regionalId: fresh.regionalId,
                role: { id: fresh.role.id, key: fresh.role.key, name: fresh.role.name },
                permissions,
            };
            const target = await tx.user.findFirst({
                where: { id, ...escopoUsuarios(currentActor) },
                select: {
                    id: true,
                    roleId: true,
                    status: true,
                    regionalId: true,
                    role: { select: { key: true } },
                },
            });
            if (!target)
                throw new ActionInputError(
                    'A conta deixou de pertencer ao seu escopo. Recarregue a página.',
                );
            return work(tx, currentActor, target);
        },
        { maxWait: 5_000, timeout: 10_000 },
    );
}

export async function preserveActiveAdministrator(
    tx: Prisma.TransactionClient,
    target: {
        status: string;
        role: { key: string };
    },
): Promise<void> {
    if (target.status !== 'ATIVO' || target.role.key !== ADMIN_ROLE_KEY) return;
    const count = await tx.user.count({
        where: { status: 'ATIVO', role: { key: ADMIN_ROLE_KEY } },
    });
    if (count <= 1)
        throw new ActionInputError(
            'Esta é a última conta ativa com perfil de administrador geral. Promova outra pessoa antes de alterar ou remover esta conta.',
        );
}
