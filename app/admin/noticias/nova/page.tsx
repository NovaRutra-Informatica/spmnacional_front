import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { requirePermission } from '@/lib/server/auth';
import { toDateInputValue } from '@/lib/labels';
import PageContent from './PageContent';

// Categorias e acervo vêm do banco a cada acesso.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Nova notícia | Painel SPM' },
};

export default async function Page() {
    const user = await requirePermission('noticias');

    const [categorias, imagens] = await Promise.all([
        prisma.category.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true } }),
        prisma.media.findMany({
            where: { kind: 'IMAGEM' },
            orderBy: { createdAt: 'desc' },
            take: 24,
            select: { id: true, url: true, originalName: true },
        }),
    ]);

    return (
        <PageContent
            categorias={categorias}
            imagens={imagens}
            autor={{ name: user.name, initials: user.initials, role: user.role.name }}
            dataPadrao={toDateInputValue(new Date())}
        />
    );
}
