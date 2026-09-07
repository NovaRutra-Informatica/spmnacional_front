import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import AdminShell, {
    type AdminNavGroup,
    type AdminNotification,
} from '@/components/admin/AdminShell';
import { prisma } from '@/lib/server/db';
import { destroySession, hasPermission, requireUser } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { escopoAtendimento } from './atendimentos/politica';
import { escopoMensagens } from './mensagens/politica';
import { escopoUsuarios, isAdminGeral } from './usuarios/politica';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const user = await requireUser();
    const adminGeral = isAdminGeral(user);

    const [posts, users, novasMensagens, atendimentosAbertos, rascunhos] = await Promise.all([
        prisma.post.count(),
        prisma.user.count({ where: escopoUsuarios(user) }),
        prisma.contactMessage.count({
            where: { AND: [escopoMensagens(user), { status: 'NOVA' }] },
        }),
        prisma.atendimento.count({
            where: { AND: [escopoAtendimento(user), { status: { not: 'ENCERRADO' } }] },
        }),
        prisma.post.count({ where: { status: { in: ['RASCUNHO', 'REVISAO'] } } }),
    ]);

    const allGroups: AdminNavGroup[] = [
        {
            label: 'Visão geral',
            items: [{ label: 'Painel', href: '/admin', icon: 'fa-gauge-high', exact: true }],
        },
        {
            label: 'Conteúdo',
            items: [
                {
                    label: 'Notícias',
                    href: '/admin/noticias',
                    icon: 'fa-newspaper',
                    count: posts,
                    permission: 'noticias',
                },
                {
                    label: 'Biblioteca de mídia',
                    href: '/admin/midia',
                    icon: 'fa-photo-film',
                    permission: 'midia',
                },
                {
                    label: 'Editais',
                    href: '/admin/editais',
                    icon: 'fa-bullhorn',
                    permission: 'editais',
                },
                {
                    label: 'Testemunhos',
                    href: '/admin/testemunhos',
                    icon: 'fa-comment-dots',
                    permission: 'noticias',
                },
                {
                    label: 'Documentos',
                    href: '/admin/documentos',
                    icon: 'fa-folder-open',
                    permission: 'noticias',
                },
                {
                    label: 'Semana do Migrante',
                    href: '/admin/semana',
                    icon: 'fa-calendar-days',
                    permission: 'noticias',
                },
                {
                    label: 'Agenda',
                    href: '/admin/agenda',
                    icon: 'fa-calendar-check',
                    permission: 'noticias',
                },
            ],
        },
        {
            label: 'Atendimento',
            items: [
                {
                    label: 'Mensagens',
                    href: '/admin/mensagens',
                    icon: 'fa-envelope-open-text',
                    count: novasMensagens,
                    permission: 'atendimentos',
                },
                {
                    label: 'Atendimentos',
                    href: '/admin/atendimentos',
                    icon: 'fa-hand-holding-heart',
                    count: atendimentosAbertos,
                    permission: 'atendimentos',
                },
            ],
        },
        {
            label: 'Pessoas e acessos',
            items: [
                {
                    label: 'Usuários',
                    href: '/admin/usuarios',
                    icon: 'fa-users',
                    count: users,
                    permission: 'usuarios',
                },
                {
                    label: 'Perfis e permissões',
                    href: '/admin/acessos',
                    icon: 'fa-shield-halved',
                    permission: 'usuarios',
                },
            ],
        },
        {
            label: 'Sistema',
            items: [
                {
                    label: 'Regionais',
                    href: '/admin/regionais',
                    icon: 'fa-map-location-dot',
                    permission: 'config',
                },
                {
                    label: 'Configurações',
                    href: '/admin/configuracoes',
                    icon: 'fa-gear',
                    permission: 'config',
                },
            ],
        },
    ];

    // Cada pessoa só enxerga o que o seu perfil permite operar.
    const groups = allGroups
        .map((group) => ({
            ...group,
            items: group.items.filter(
                (item) =>
                    (!item.permission || hasPermission(user, item.permission)) &&
                    (item.href !== '/admin/acessos' || adminGeral),
            ),
        }))
        .filter((group) => group.items.length > 0);

    // O sino oferece caminhos reais e respeita o mesmo recorte de permissões
    // aplicado à navegação. Assim ele não revela pendências de outro módulo.
    const notifications: AdminNotification[] = [];
    if (hasPermission(user, 'noticias') && rascunhos > 0) {
        notifications.push({
            id: 'conteudo-pendente',
            count: rascunhos,
            label: rascunhos === 1 ? 'conteúdo pendente' : 'conteúdos pendentes',
            hint: 'Revisar rascunhos e publicações em revisão',
            href: '/admin/noticias',
            icon: 'fa-pen-ruler',
        });
    }
    if (hasPermission(user, 'atendimentos') && novasMensagens > 0) {
        notifications.push({
            id: 'mensagens-novas',
            count: novasMensagens,
            label: novasMensagens === 1 ? 'mensagem nova' : 'mensagens novas',
            hint: adminGeral
                ? 'Ler e atribuir mensagens do Fale Conosco'
                : 'Ler mensagens atribuídas a você',
            href: '/admin/mensagens',
            icon: 'fa-envelope-open-text',
        });
    }
    if (hasPermission(user, 'atendimentos') && atendimentosAbertos > 0) {
        notifications.push({
            id: 'atendimentos-abertos',
            count: atendimentosAbertos,
            label: atendimentosAbertos === 1 ? 'atendimento em aberto' : 'atendimentos em aberto',
            hint: 'Acompanhar fichas que ainda não foram encerradas',
            href: '/admin/atendimentos',
            icon: 'fa-hand-holding-heart',
        });
    }

    async function logoutAction() {
        'use server';
        const current = await requireUser();
        await recordAudit({
            action: 'Logout',
            target: 'Painel administrativo',
            userId: current.id,
            actorLabel: current.email,
        });
        await destroySession();
        redirect('/atendente');
    }

    return (
        <AdminShell
            user={{ name: user.name, role: user.role.name, initials: user.initials }}
            groups={groups}
            notifications={notifications}
            logoutAction={logoutAction}
        >
            {children}
        </AdminShell>
    );
}
