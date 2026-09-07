import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent, { type AuditEntry, type PermissionInfo, type RoleMatrix } from './PageContent';
import { isAdminGeral } from '../usuarios/politica';

export const dynamic = 'force-dynamic';

/** Paginação simples: a tela mostra a janela mais recente da auditoria. */
const AUDIT_LIMIT = 100;

export const metadata: Metadata = {
    title: { absolute: 'Perfis e permissões | Painel SPM' },
};

export default async function Page() {
    const current = await requirePermission('usuarios');
    if (!isAdminGeral(current)) notFound();

    const [roles, permissions, audit, totalUsers] = await Promise.all([
        prisma.role.findMany({
            select: {
                id: true,
                key: true,
                name: true,
                description: true,
                permissions: { select: { permissionKey: true } },
                _count: { select: { users: true } },
            },
            orderBy: { order: 'asc' },
        }),
        prisma.permission.findMany({
            select: { key: true, label: true, hint: true },
            orderBy: { order: 'asc' },
        }),
        prisma.auditLog.findMany({
            select: {
                id: true,
                action: true,
                target: true,
                level: true,
                ip: true,
                actorLabel: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: AUDIT_LIMIT,
        }),
        prisma.user.count(),
    ]);

    const roleMatrix: RoleMatrix[] = roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: role.permissions.map((item) => item.permissionKey),
        userCount: role._count.users,
    }));

    const permissionList: PermissionInfo[] = permissions.map((permission) => ({
        key: permission.key,
        label: permission.label,
        hint: permission.hint,
    }));

    const auditEntries: AuditEntry[] = audit.map((entry) => ({
        id: entry.id,
        action: entry.action,
        target: entry.target,
        level: entry.level,
        actor: entry.actorLabel,
        ip: entry.ip ?? '—',
        when: formatDateTimeShort(entry.createdAt),
    }));

    return (
        <PageContent
            roles={roleMatrix}
            permissions={permissionList}
            audit={auditEntries}
            totalUsers={totalUsers}
            auditLimit={AUDIT_LIMIT}
        />
    );
}
