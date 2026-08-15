import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { hasPermission, requireUser } from '@/lib/server/auth';
import { formatDateTimeShort } from '@/lib/labels';
import PageContent, {
    type CategoryRow,
    type DashboardShortcut,
    type LogRow,
    type RecentPost,
    type TopPost,
} from './PageContent';

// O painel lê o Postgres a cada acesso; sem isto o build tentaria pré-renderizar.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'Painel | Painel SPM' },
};

/** Nome legível de cada permissão, para explicar o bloqueio de acesso. */
const PERMISSION_LABEL: Record<string, string> = {
    noticias: 'o módulo de conteúdo (notícias, agenda e Semana do Migrante)',
    midia: 'a biblioteca de mídia',
    editais: 'o módulo de editais',
    atendimentos: 'os atendimentos e as mensagens do Fale Conosco',
    usuarios: 'a gestão de usuários e perfis',
    config: 'as configurações do sistema',
};

interface PageProps {
    searchParams: Promise<{ erro?: string; recurso?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
    const [user, params] = await Promise.all([requireUser(), searchParams]);

    const [
        statusRows,
        totalPosts,
        activeUsers,
        newMessages,
        openAtendimentos,
        recentRows,
        categoryRows,
        auditRows,
        topRows,
    ] = await Promise.all([
        prisma.post.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.post.count(),
        prisma.user.count({ where: { status: 'ATIVO' } }),
        prisma.contactMessage.count({ where: { status: 'NOVA' } }),
        prisma.atendimento.count({ where: { status: { not: 'ENCERRADO' } } }),
        prisma.post.findMany({
            take: 5,
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                title: true,
                coverUrl: true,
                authorName: true,
                status: true,
                updatedAt: true,
                category: { select: { name: true } },
            },
        }),
        prisma.category.findMany({
            orderBy: { order: 'asc' },
            select: { id: true, name: true, _count: { select: { posts: true } } },
        }),
        prisma.auditLog.findMany({
            take: 6,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                action: true,
                target: true,
                level: true,
                actorLabel: true,
                createdAt: true,
            },
        }),
        prisma.post.findMany({
            where: { status: 'PUBLICADO' },
            orderBy: { views: 'desc' },
            take: 4,
            select: { id: true, title: true, views: true, category: { select: { name: true } } },
        }),
    ]);

    const countByStatus = (status: string): number =>
        statusRows.find((row) => row.status === status)?._count._all ?? 0;

    const published = countByStatus('PUBLICADO');
    const drafts = countByStatus('RASCUNHO');
    const inReview = countByStatus('REVISAO');
    const scheduled = countByStatus('AGENDADO');

    const recent: RecentPost[] = recentRows.map((post) => ({
        id: post.id,
        title: post.title,
        cover: post.coverUrl,
        author: post.authorName,
        category: post.category.name,
        status: post.status,
        updatedAt: formatDateTimeShort(post.updatedAt),
    }));

    // A porcentagem usa o total de notícias para que as barras somem 100%.
    const totalForBars = totalPosts || 1;
    const byCategory: CategoryRow[] = categoryRows
        .map((category) => ({
            id: category.id,
            name: category.name,
            count: category._count.posts,
            pct: Math.round((category._count.posts / totalForBars) * 100),
        }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count);

    const log: LogRow[] = auditRows.map((entry) => ({
        id: entry.id,
        action: entry.action,
        target: entry.target,
        level: entry.level,
        actor: entry.actorLabel,
        when: formatDateTimeShort(entry.createdAt),
    }));

    const topPosts: TopPost[] = topRows.map((post) => ({
        id: post.id,
        title: post.title,
        views: post.views,
        category: post.category.name,
    }));

    // Cada atalho só aparece para quem consegue mesmo abrir a rota.
    const allShortcuts: (DashboardShortcut & { permission?: string })[] = [
        {
            href: '/admin/noticias/nova',
            icon: 'fa-plus',
            label: 'Publicar notícia',
            permission: 'noticias',
        },
        { href: '/admin/midia', icon: 'fa-upload', label: 'Enviar arquivo', permission: 'midia' },
        {
            href: '/admin/mensagens',
            icon: 'fa-envelope-open-text',
            label: 'Ler mensagens',
            permission: 'atendimentos',
        },
        {
            href: '/admin/semana',
            icon: 'fa-calendar-days',
            label: 'Semana do Migrante',
            permission: 'noticias',
        },
        {
            href: '/admin/usuarios/novo',
            icon: 'fa-user-plus',
            label: 'Convidar usuário',
            permission: 'usuarios',
        },
        {
            href: '/admin/acessos',
            icon: 'fa-shield-halved',
            label: 'Revisar permissões',
            permission: 'usuarios',
        },
    ];

    const shortcuts: DashboardShortcut[] = allShortcuts
        .filter((item) => !item.permission || hasPermission(user, item.permission))
        .map(({ href, icon, label }) => ({ href, icon, label }));

    const recurso = params.recurso ?? '';
    const blockedResource =
        params.erro === 'permissao' ? (PERMISSION_LABEL[recurso] ?? 'o recurso solicitado') : null;

    return (
        <PageContent
            userName={user.name}
            roleName={user.role.name}
            canCreatePost={hasPermission(user, 'noticias')}
            canInviteUser={hasPermission(user, 'usuarios')}
            canSeeAudit={hasPermission(user, 'usuarios')}
            blockedResource={blockedResource}
            lastActivity={log[0]?.when ?? null}
            stats={{
                totalPosts,
                published,
                drafts,
                inReview,
                scheduled,
                activeUsers,
                newMessages,
                openAtendimentos,
            }}
            recent={recent}
            byCategory={byCategory}
            log={log}
            topPosts={topPosts}
            shortcuts={shortcuts}
        />
    );
}
