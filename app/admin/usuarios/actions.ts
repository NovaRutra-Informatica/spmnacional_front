'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import { revokeAllSessions, type SessionUser } from '@/lib/server/auth';
import { isWorkspaceEmail, workspaceDomain } from '@/lib/config/workspace-auth';
import { env } from '@/lib/server/env';
import { encryptInviteEmail, inviteVersionHash } from '@/lib/server/generic-email-outbox';
import {
    preserveActiveAdministrator,
    withProtectedUserMutation,
} from '@/lib/server/user-management';
import {
    actionError,
    actionOk,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import type { UserStatus } from '@/lib/generated/prisma/enums';
import { initialsFrom } from './initials';
import { ADMIN_ROLE_KEY, escopoUsuarios, perfilPermitido, regionalPermitida } from './politica';

// Domain validation and Google Workspace OAuth prove ownership at login.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function revalidarUsuarios(): void {
    // 'layout' e não 'page': a contagem de contas do menu lateral é montada em
    // `app/admin/layout.tsx`, fora da página. Revalidar só as rotas deixaria o
    // número do menu desatualizado — e este modo já cobre a listagem, a ficha
    // de cada conta e a tela de perfis de uma vez.
    revalidatePath('/admin', 'layout');
}

/** Returns the same safe result for missing and out-of-scope accounts. */
async function carregarAlvo(user: SessionUser, id: string) {
    return prisma.user.findFirst({
        where: { id, ...escopoUsuarios(user) },
        select: {
            id: true,
            name: true,
            email: true,
            status: true,
            roleId: true,
            regionalId: true,
            role: { select: { key: true, name: true } },
        },
    });
}

// ---------------------------------------------------------
// Convite de novo usuário
// ---------------------------------------------------------

const conviteSchema = z.object({
    name: z
        .string()
        .min(3, 'Informe o nome da pessoa ou da equipe.')
        .max(120, 'Use no máximo 120 caracteres.'),
    email: z.string().regex(EMAIL_RE, 'Informe um e-mail válido.').max(180, 'E-mail muito longo.'),
    roleId: z.string().min(1, 'Escolha o perfil de acesso.'),
    regionalId: z.string(),
});

export async function convidarUsuario(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction('usuarios', async (user) => {
        const parsed = conviteSchema.safeParse({
            name: formString(formData, 'name'),
            email: formString(formData, 'email').toLowerCase(),
            roleId: formString(formData, 'roleId'),
            regionalId: formString(formData, 'regionalId'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const { name, email, roleId, regionalId } = parsed.data;
        if (!isWorkspaceEmail(email, workspaceDomain(env.google.allowedDomain)))
            return actionError('Use um e-mail do domínio institucional autorizado.', {
                email: 'E-mail fora do Google Workspace configurado.',
            });

        const role = await prisma.role.findUnique({
            where: { id: roleId },
            select: { id: true, key: true, name: true },
        });

        if (!role) {
            return actionError('Perfil de acesso não encontrado.', {
                roleId: 'Escolha um perfil válido.',
            });
        }

        if (!perfilPermitido(user, role.key)) {
            return actionError('Você não pode atribuir o perfil de administrador geral.', {
                roleId: 'Escolha um perfil não administrativo.',
            });
        }

        if (!regionalPermitida(user, regionalId)) {
            return actionError('Você só pode criar contas na sua própria regional.', {
                regionalId: 'Escolha a sua regional.',
            });
        }

        const existente = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existente) {
            return actionError('Já existe uma conta com este e-mail.', {
                email: 'Este e-mail já tem acesso ao painel.',
            });
        }

        if (regionalId) {
            const regional = await prisma.regional.findUnique({
                where: { id: regionalId },
                select: { id: true },
            });
            if (!regional) {
                return actionError('Regional não encontrada.', {
                    regionalId: 'Escolha uma regional válida.',
                });
            }
        }

        // Notification only: authorization is explicit and OAuth proves ownership.
        const inviteUrl = new URL('/atendente', env.appUrl).href;
        const payloadEncrypted = encryptInviteEmail({
            name,
            email,
            inviteUrl,
            roleName: role.name,
        });
        const criado = await prisma.$transaction(
            async (tx) => {
                const created = await tx.user.create({
                    data: {
                        name,
                        email,
                        initials: initialsFrom(name),
                        roleId: role.id,
                        regionalId: regionalId || null,
                        status: 'ATIVO',
                        passwordHash: null,
                        mfaRequired: true,
                        notificationVersion: 1,
                    },
                    select: { id: true, name: true, email: true, notificationVersion: true },
                });
                await tx.genericEmailJob.create({
                    data: {
                        kind: 'USER_INVITE',
                        userId: created.id,
                        versionHash: inviteVersionHash(created.id, created.notificationVersion),
                        payloadEncrypted,
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
                    },
                    select: { id: true },
                });
                return created;
            },
            { maxWait: 5_000, timeout: 10_000 },
        );

        await recordAudit({
            action: 'Acesso Google Workspace autorizado',
            target: criado.email,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
            metadata: {
                perfil: role.key,
                regionalId: regionalId || null,
                notificacaoAgendada: true,
            },
        });

        revalidarUsuarios();

        // SMTP sends a notification; it is not an authentication dependency.
        return actionOk(
            'Conta criada. As instruções de acesso foram agendadas para envio por e-mail; o endereço do login também pode ser compartilhado.',
            { id: criado.id, agendado: true, inviteUrl },
        );
    });
}

// ---------------------------------------------------------
// Edição de uma conta
// ---------------------------------------------------------

const edicaoSchema = z.object({
    id: z.string().min(1, 'Conta não identificada.'),
    name: z
        .string()
        .min(3, 'Informe o nome da pessoa ou da equipe.')
        .max(120, 'Use no máximo 120 caracteres.'),
    roleId: z.string().min(1, 'Escolha o perfil de acesso.'),
    regionalId: z.string(),
});

function ehUserStatus(value: string): value is UserStatus {
    return value === 'ATIVO' || value === 'INATIVO' || value === 'PENDENTE';
}

export async function atualizarUsuario(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction('usuarios', async (user) => {
        const parsed = edicaoSchema.safeParse({
            id: formString(formData, 'id'),
            name: formString(formData, 'name'),
            roleId: formString(formData, 'roleId'),
            regionalId: formString(formData, 'regionalId'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const status = formString(formData, 'status');
        if (!ehUserStatus(status)) {
            return actionError('Escolha uma situação válida para a conta.', {
                status: 'Situação inválida.',
            });
        }

        const { id, name, roleId, regionalId } = parsed.data;

        const alvo = await carregarAlvo(user, id);
        if (!alvo) return actionError('Conta não encontrada ou fora do seu escopo de acesso.');

        const novoPerfil = await prisma.role.findUnique({
            where: { id: roleId },
            select: { id: true, key: true, name: true },
        });

        if (!novoPerfil) {
            return actionError('Perfil de acesso não encontrado.', {
                roleId: 'Escolha um perfil válido.',
            });
        }

        if (!perfilPermitido(user, novoPerfil.key)) {
            return actionError('Você não pode atribuir o perfil de administrador geral.', {
                roleId: 'Escolha um perfil não administrativo.',
            });
        }

        if (!regionalPermitida(user, regionalId)) {
            return actionError('Você não pode transferir contas para outra regional.', {
                regionalId: 'Mantenha a conta na sua própria regional.',
            });
        }

        // Ninguém se rebaixa nem se desliga sozinho: a mudança precisa passar
        // por outra pessoa com a permissão, para não haver perda de acesso
        // acidental nem autoproteção contra auditoria.
        if (alvo.id === user.id) {
            if (novoPerfil.id !== alvo.roleId) {
                return actionError('Você não pode alterar o próprio perfil de acesso.', {
                    roleId: 'Peça a outra pessoa com permissão de usuários.',
                });
            }
            if (status !== 'ATIVO') {
                return actionError('Você não pode desativar a própria conta.', {
                    status: 'Peça a outra pessoa com permissão de usuários.',
                });
            }
        }

        if (
            status === 'ATIVO' &&
            !isWorkspaceEmail(alvo.email, workspaceDomain(env.google.allowedDomain))
        )
            return actionError('A conta precisa usar o domínio institucional configurado.');

        const perdeAdmin = novoPerfil.key !== ADMIN_ROLE_KEY || status !== 'ATIVO';
        if (regionalId) {
            const regional = await prisma.regional.findUnique({
                where: { id: regionalId },
                select: { id: true },
            });
            if (!regional) {
                return actionError('Regional não encontrada.', {
                    regionalId: 'Escolha uma regional válida.',
                });
            }
        }

        const atualizado = await withProtectedUserMutation(
            user,
            alvo.id,
            async (tx, currentActor, currentTarget) => {
                if (
                    !perfilPermitido(currentActor, novoPerfil.key) ||
                    !regionalPermitida(currentActor, regionalId)
                )
                    throw new Error('User assignment left actor scope');
                if (
                    currentTarget.id === currentActor.id &&
                    (novoPerfil.id !== currentTarget.roleId || status !== 'ATIVO')
                )
                    throw new Error('Self deactivation or role change denied');
                if (perdeAdmin) await preserveActiveAdministrator(tx, currentTarget);
                return tx.user.updateMany({
                    where: { id: currentTarget.id, ...escopoUsuarios(currentActor) },
                    data: {
                        name,
                        initials: initialsFrom(name),
                        roleId: novoPerfil.id,
                        regionalId: regionalId || null,
                        status,
                        notificationVersion: { increment: 1 },
                        // Reativar limpa o bloqueio por tentativas malsucedidas.
                        ...(status === 'ATIVO' ? { failedLoginCount: 0, lockedUntil: null } : {}),
                        // Sair de "pendente" queima o convite em aberto. Sem isto, uma
                        // conta devolvida a "pendente" mais tarde voltaria a aceitar o
                        // link antigo enquanto ele estivesse dentro dos 7 dias.
                        ...(status !== 'PENDENTE'
                            ? { inviteTokenHash: null, inviteExpiresAt: null }
                            : {}),
                    },
                });
            },
        );

        if (atualizado.count !== 1) {
            return actionError('A conta deixou de pertencer ao seu escopo. Recarregue a página.');
        }

        // Conta que deixa de estar ativa não pode continuar navegando.
        if (status !== 'ATIVO') {
            await revokeAllSessions(alvo.id);
        }

        await recordAudit({
            action: 'Usuário atualizado',
            target: alvo.email,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
            metadata: {
                perfilAnterior: alvo.role.key,
                perfilNovo: novoPerfil.key,
                statusAnterior: alvo.status,
                statusNovo: status,
            },
        });

        revalidarUsuarios();
        return actionOk('Alterações salvas.');
    });
}

// ---------------------------------------------------------
// Encerrar sessões de uma conta
// ---------------------------------------------------------

export async function encerrarSessoesUsuario(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction('usuarios', async (user) => {
        const id = formString(formData, 'id');
        if (!id) return actionError('Conta não identificada.');

        const alvo = await carregarAlvo(user, id);
        if (!alvo) return actionError('Conta não encontrada ou fora do seu escopo de acesso.');

        const validas = await prisma.session.count({
            where: { userId: alvo.id, revokedAt: null, expiresAt: { gt: new Date() } },
        });

        if (validas === 0) {
            return actionError('Esta conta não tem sessões ativas no momento.');
        }

        await revokeAllSessions(alvo.id);

        await recordAudit({
            action: 'Sessões encerradas',
            target: alvo.email,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
            metadata: { sessoes: validas, contaPropria: alvo.id === user.id },
        });

        revalidarUsuarios();
        return actionOk(validas === 1 ? '1 sessão encerrada.' : `${validas} sessões encerradas.`);
    });
}

// ---------------------------------------------------------
// Ações da listagem
//
// Um único despachante porque a lista compartilha um só `useActionState`: o
// resultado (inclusive o link de convite) aparece num aviso no topo da tela.
// ---------------------------------------------------------

const INTENTS = ['ativar', 'desativar', 'reenviar-convite', 'remover'] as const;
type Intent = (typeof INTENTS)[number];

function parseIntent(value: string): Intent | null {
    return (INTENTS as readonly string[]).includes(value) ? (value as Intent) : null;
}

export async function executarAcaoUsuario(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction('usuarios', async (user) => {
        const id = formString(formData, 'id');
        const intent = parseIntent(formString(formData, 'intent'));

        if (!id || !intent) return actionError('Ação não reconhecida.');

        const alvo = await carregarAlvo(user, id);
        if (!alvo) return actionError('Conta não encontrada ou fora do seu escopo de acesso.');

        if (intent === 'ativar') {
            if (!isWorkspaceEmail(alvo.email, workspaceDomain(env.google.allowedDomain)))
                return actionError('A conta precisa usar o domínio institucional configurado.');
            if (alvo.status === 'ATIVO') {
                return actionError('Esta conta já está ativa.');
            }

            const atualizado = await prisma.user.updateMany({
                where: { id: alvo.id, ...escopoUsuarios(user) },
                data: {
                    status: 'ATIVO',
                    failedLoginCount: 0,
                    lockedUntil: null,
                    // A conta já está ativa: o convite pendente perde a razão de
                    // existir e não pode sobreviver para um uso futuro.
                    inviteTokenHash: null,
                    inviteExpiresAt: null,
                },
            });

            if (atualizado.count !== 1) {
                return actionError(
                    'A conta deixou de pertencer ao seu escopo. Recarregue a página.',
                );
            }

            await recordAudit({
                action: alvo.status === 'PENDENTE' ? 'Acesso ativado' : 'Acesso reativado',
                target: alvo.email,
                level: 'ALERTA',
                userId: user.id,
                actorLabel: user.email,
                metadata: { statusAnterior: alvo.status },
            });

            revalidarUsuarios();
            return actionOk(`Acesso de ${alvo.name} ativado.`);
        }

        if (intent === 'desativar') {
            if (alvo.id === user.id) {
                return actionError('Você não pode desativar a própria conta.');
            }
            if (alvo.status === 'INATIVO') {
                return actionError('Esta conta já está desativada.');
            }
            const atualizado = await withProtectedUserMutation(
                user,
                alvo.id,
                async (tx, currentActor, currentTarget) => {
                    if (currentTarget.id === currentActor.id)
                        throw new Error('Self deactivation denied');
                    await preserveActiveAdministrator(tx, currentTarget);
                    return tx.user.updateMany({
                        where: { id: currentTarget.id, ...escopoUsuarios(currentActor) },
                        data: {
                            status: 'INATIVO',
                            // Desativar também queima o convite ainda não aceito.
                            inviteTokenHash: null,
                            inviteExpiresAt: null,
                            notificationVersion: { increment: 1 },
                        },
                    });
                },
            );

            if (atualizado.count !== 1) {
                return actionError(
                    'A conta deixou de pertencer ao seu escopo. Recarregue a página.',
                );
            }

            // Desativar sem encerrar a sessão deixaria a pessoa navegando até o
            // token expirar.
            await revokeAllSessions(alvo.id);

            await recordAudit({
                action: 'Acesso desativado',
                target: alvo.email,
                level: 'ALERTA',
                userId: user.id,
                actorLabel: user.email,
            });

            revalidarUsuarios();
            return actionOk(`Acesso de ${alvo.name} desativado e sessões encerradas.`);
        }

        if (intent === 'reenviar-convite') {
            if (
                alvo.status !== 'ATIVO' ||
                !isWorkspaceEmail(alvo.email, workspaceDomain(env.google.allowedDomain))
            ) {
                return actionError(
                    'Ative uma conta do domínio institucional antes de enviar as instruções.',
                );
            }
            const inviteUrl = new URL('/atendente', env.appUrl).href;
            const queued = await prisma.$transaction(
                async (tx) => {
                    const changed = await tx.user.updateMany({
                        where: { id: alvo.id, ...escopoUsuarios(user), status: 'ATIVO' },
                        data: { notificationVersion: { increment: 1 } },
                    });
                    if (changed.count !== 1) return false;
                    const current = await tx.user.findFirst({
                        where: { id: alvo.id, ...escopoUsuarios(user), status: 'ATIVO' },
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            notificationVersion: true,
                            role: { select: { name: true } },
                        },
                    });
                    if (
                        !current ||
                        !isWorkspaceEmail(current.email, workspaceDomain(env.google.allowedDomain))
                    )
                        throw new Error('Invite target changed');
                    await tx.genericEmailJob.create({
                        data: {
                            kind: 'USER_INVITE',
                            userId: current.id,
                            versionHash: inviteVersionHash(current.id, current.notificationVersion),
                            payloadEncrypted: encryptInviteEmail({
                                name: current.name,
                                email: current.email,
                                inviteUrl,
                                roleName: current.role.name,
                            }),
                            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
                        },
                        select: { id: true },
                    });
                    return true;
                },
                { maxWait: 5_000, timeout: 10_000 },
            );
            if (!queued)
                return actionError(
                    'A conta deixou de pertencer ao seu escopo. Recarregue a página.',
                );

            await recordAudit({
                action: 'Instruções de acesso Workspace reenviadas',
                target: alvo.email,
                level: 'INFO',
                userId: user.id,
                actorLabel: user.email,
                metadata: { notificacaoAgendada: true },
            });

            revalidarUsuarios();
            return actionOk(
                'Instruções de acesso agendadas para envio por e-mail. O endereço do login também pode ser compartilhado.',
                { agendado: true, inviteUrl },
            );
        }

        // intent === 'remover'
        if (alvo.id === user.id) {
            return actionError('Você não pode remover a própria conta.');
        }
        const removido = await withProtectedUserMutation(
            user,
            alvo.id,
            async (tx, currentActor, currentTarget) => {
                if (currentTarget.id === currentActor.id) throw new Error('Self removal denied');
                await preserveActiveAdministrator(tx, currentTarget);
                return tx.user.deleteMany({
                    where: { id: currentTarget.id, ...escopoUsuarios(currentActor) },
                });
            },
        );
        if (removido.count !== 1) {
            return actionError('A conta deixou de pertencer ao seu escopo. Recarregue a página.');
        }

        await recordAudit({
            action: 'Usuário removido',
            target: alvo.email,
            level: 'CRITICO',
            userId: user.id,
            actorLabel: user.email,
            metadata: { perfil: alvo.role.key },
        });

        revalidarUsuarios();
        return actionOk(`Acesso de ${alvo.name} removido.`);
    });
}
