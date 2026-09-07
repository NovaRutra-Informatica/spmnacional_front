import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { isMailEnabled } from '@/lib/server/env';
import PageContent, {
    type PermissionInfo,
    type RegionalOption,
    type RoleDetail,
} from './PageContent';
import { ADMIN_ROLE_KEY, isAdminGeral } from '../politica';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Convidar usuário | Painel SPM' },
};

export default async function Page() {
    const current = await requirePermission('usuarios');
    const adminGeral = isAdminGeral(current);

    const [roles, permissions, regionais] = await Promise.all([
        prisma.role.findMany({
            where: adminGeral ? {} : { key: { not: ADMIN_ROLE_KEY } },
            select: {
                id: true,
                name: true,
                permissions: { select: { permissionKey: true } },
            },
            orderBy: { order: 'asc' },
        }),
        prisma.permission.findMany({
            select: { key: true, label: true, hint: true },
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
    ]);

    const roleDetails: RoleDetail[] = roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions.map((item) => item.permissionKey),
    }));

    const permissionList: PermissionInfo[] = permissions.map((permission) => ({
        key: permission.key,
        label: permission.label,
        hint: permission.hint,
    }));

    const regionalOptions: RegionalOption[] = regionais.map((regional) => ({
        id: regional.id,
        name: regional.name,
    }));

    return (
        <PageContent
            roles={roleDetails}
            permissions={permissionList}
            regionais={regionalOptions}
            mailEnabled={isMailEnabled()}
            canManagePermissions={adminGeral}
            allowNoRegional={adminGeral}
        />
    );
}
