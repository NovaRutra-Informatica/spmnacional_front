import type { Metadata } from 'next';
import { requirePermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import PageContent, { type RegionalRow } from './PageContent';

export const metadata: Metadata = {
    title: { absolute: 'Regionais | Painel SPM' },
};

// A página lê o Postgres: sem isto o `docker build` (que roda sem banco) quebraria no prerender.
export const dynamic = 'force-dynamic';

export default async function Page() {
    await requirePermission('config');

    const rows = await prisma.regional.findMany({
        orderBy: [{ region: 'asc' }, { order: 'asc' }, { name: 'asc' }],
        select: {
            id: true,
            slug: true,
            uf: true,
            city: true,
            name: true,
            region: true,
            description: true,
            focus: true,
            address: true,
            phone: true,
            email: true,
            active: true,
            order: true,
            // A tela avisa antes de tentar excluir uma regional com vínculos.
            _count: { select: { users: true, atendimentos: true } },
        },
    });

    const regionais: RegionalRow[] = rows.map(({ _count, ...regional }) => ({
        ...regional,
        // Campos opcionais viram string vazia: o formulário não lida com `null`.
        city: regional.city ?? '',
        address: regional.address ?? '',
        phone: regional.phone ?? '',
        email: regional.email ?? '',
        usuarios: _count.users,
        atendimentos: _count.atendimentos,
    }));

    return <PageContent regionais={regionais} />;
}
