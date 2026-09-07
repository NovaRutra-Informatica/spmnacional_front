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
import { escopoAtendimento } from './atendimentos/politica';
import { escopoMensagens } from './mensagens/politica';
import { escopoUsuarios, isAdminGeral } from './usuarios/politica';

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
    const adminGeral = isAdminGeral(user);
    const canManagePosts = hasPermission(user, 'noticias');
    const canViewMessages = hasPermission(user, 'atendimentos');
    const canViewAtendimentos = hasPermission(user, 'atendimentos');
    const canManageUsers = hasPermission(user, 'usuarios');

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
        canManagePosts
            ? prisma.post.groupBy({ by: ['status'], _count: { _all: true } })
            : Promise.resolve([]),
        canManagePosts ? prisma.post.count() : Promise.resolve(0),
        canManageUsers
            ? prisma.user.count({ where: { AND: [escopoUsuarios(user), { status: 'ATIVO' }] } })
            : Promise.resolve(0),
        canViewMessages
            ? prisma.contactMessage.count({
                  where: { AND: [escopoMensagens(user), { status: 'NOVA' }] },
              })
            : Promise.resolve(0),
        canViewAtendimentos
            ? prisma.atendimento.count({
                  where: { AND: [escopoAtendimento(user), { status: { not: 'ENCERRADO' } }] },
              })
            : Promise.resolve(0),
        canManagePosts
            ? prisma.post.findMany({
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
              })
            : Promise.resolve([]),
        canManagePosts
            ? prisma.category.findMany({
                  orderBy: { order: 'asc' },
                  select: { id: true, name: true, _count: { select: { posts: true } } },
              })
            : Promise.resolve([]),
        adminGeral
            ? prisma.auditLog.findMany({
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
              })
            : Promise.resolve([]),
        canManagePosts
            ? prisma.post.findMany({
                  where: { status: 'PUBLICADO' },
                  orderBy: { views: 'desc' },
                  take: 4,
                  select: {
                      id: true,
                      title: true,
                      views: true,
                      category: { select: { name: true } },
                  },
              })
            : Promise.resolve([]),
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
        .filter(
            (item) =>
                (!item.permission || hasPermission(user, item.permission)) &&
                (item.href !== '/admin/acessos' || adminGeral),
        )
        .map(({ href, icon, label }) => ({ href, icon, label }));

    const recurso = params.recurso ?? '';
    const blockedResource =
        params.erro === 'permissao' ? (PERMISSION_LABEL[recurso] ?? 'o recurso solicitado') : null;

    return (
        <PageContent
            userName={user.name}
            roleName={user.role.name}
            canCreatePost={canManagePosts}
            canInviteUser={canManageUsers}
            canViewMessages={canViewMessages}
            canViewAtendimentos={canViewAtendimentos}
            canManageUsers={canManageUsers}
            canSeeAudit={adminGeral}
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
