import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { getSiteSettings } from '@/lib/server/queries';
import { isGoogleOAuthEnabled } from '@/lib/server/env';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent from './PageContent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Configurações | Painel SPM' },
};

export default async function Page() {
    const user = await requirePermission('config');

    const [settings, conta, sessoesAtivas] = await Promise.all([
        getSiteSettings(),
        prisma.user.findUnique({
            where: { id: user.id },
            select: { lastAccessAt: true, passwordHash: true },
        }),
        prisma.session.count({
            where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        }),
    ]);

    return (
        <PageContent
            settings={settings}
            account={{
                name: user.name,
                email: user.email,
                initials: user.initials,
                roleName: user.role.name,
                regionalName: user.regionalName,
                lastAccess: conta?.lastAccessAt ? formatDateTimeShort(conta.lastAccessAt) : null,
                hasPassword: Boolean(conta?.passwordHash),
                sessoesAtivas,
            }}
            googleOAuthEnabled={isGoogleOAuthEnabled()}
        />
    );
}
