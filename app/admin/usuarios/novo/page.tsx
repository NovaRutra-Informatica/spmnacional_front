import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { isMailEnabled } from '@/lib/server/env';
import PageContent, {
    type PermissionInfo,
    type RegionalOption,
    type RoleDetail,
} from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Convidar usuário | Painel SPM' },
};

export default async function Page() {
    await requirePermission('usuarios');

    const [roles, permissions, regionais] = await Promise.all([
        prisma.role.findMany({
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
            where: { active: true },
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
        />
    );
}
