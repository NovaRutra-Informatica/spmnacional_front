import type { PrismaClient } from '../../lib/generated/prisma/client';
import { PERMISSIONS, ROLES } from '../../lib/config/roles';
import { isWorkspaceEmail, workspaceDomain } from '../../lib/config/workspace-auth';

export class AccountInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AccountInputError';
    }
}
export interface AccountInput {
    email: string;
    workspaceDomain: string;
    name?: string;
    roleKey?: string;
    regionalSlug?: string;
    updateExisting?: boolean;
}
export function validateAccountInput(input: AccountInput): AccountInput {
    const email = input.email.trim().toLowerCase();
    const domain = workspaceDomain(input.workspaceDomain);
    if (!isWorkspaceEmail(email, domain)) {
        throw new AccountInputError(
            'Informe um e-mail do domínio institucional configurado em GOOGLE_OAUTH_ALLOWED_DOMAIN.',
        );
    }
    // Reject accidental legacy callers instead of silently accepting unused passwords.
    if ('password' in input) throw new AccountInputError('Senhas locais não são suportadas.');
    const name = input.name?.trim();
    if (
        name !== undefined &&
        (name.length < 2 || name.length > 160 || /[\u0000-\u001f\u007f]/.test(name))
    ) {
        throw new AccountInputError('O nome deve ter entre 2 e 160 caracteres.');
    }
    if (input.roleKey !== undefined && !/^[a-z][a-z0-9_-]{0,63}$/.test(input.roleKey))
        throw new AccountInputError('A chave de perfil é inválida.');
    if (input.regionalSlug !== undefined && !/^[a-z0-9][a-z0-9-]{0,159}$/.test(input.regionalSlug))
        throw new AccountInputError('A regional informada é inválida.');
    return { ...input, email, workspaceDomain: domain!, name };
}
function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toUpperCase();
}

/** Só cria perfis/permissões e UM administrador. Nenhum conteúdo demonstrativo. */
export async function bootstrapProduction(
    db: PrismaClient,
    raw: AccountInput,
): Promise<{ userId: string }> {
    const input = validateAccountInput(raw);
    return db.$transaction(
        async (tx) => {
            // Bloqueia inserções concorrentes, inclusive de outra execução do bootstrap.
            await tx.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
            if ((await tx.user.count()) !== 0)
                throw new AccountInputError(
                    'Bootstrap recusado: já existem usuários. Nenhuma conta foi sobrescrita.',
                );
            for (const permission of PERMISSIONS) {
                await tx.permission.upsert({
                    where: { key: permission.key },
                    create: permission,
                    update: permission,
                });
            }
            let adminRoleId = '';
            for (const { permissions, ...role } of ROLES) {
                const saved = await tx.role.upsert({
                    where: { key: role.key },
                    create: role,
                    update: role,
                });
                await tx.rolePermission.deleteMany({ where: { roleId: saved.id } });
                if (permissions.length)
                    await tx.rolePermission.createMany({
                        data: permissions.map((permissionKey) => ({
                            roleId: saved.id,
                            permissionKey,
                        })),
                    });
                if (role.key === 'admin') adminRoleId = saved.id;
            }
            const name = input.name ?? 'Administrador SPM';
            const user = await tx.user.create({
                data: {
                    email: input.email,
                    name,
                    initials: initials(name),
                    passwordHash: null,
                    roleId: adminRoleId,
                    status: 'ATIVO',
                    mustChangePassword: false,
                    mfaRequired: true,
                },
                select: { id: true },
            });
            return { userId: user.id };
        },
        { maxWait: 10_000, timeout: 30_000 },
    );
}

/** Manutenção explícita: atualização e revogação de sessões sempre atômicas. */
export async function provisionAccount(
    db: PrismaClient,
    raw: AccountInput,
): Promise<{ created: boolean; revokedSessions: number }> {
    const input = validateAccountInput(raw);
    return db.$transaction(
        async (tx) => {
            await tx.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
            const existing = await tx.user.findUnique({
                where: { email: input.email },
                include: { role: true },
            });
            if (existing && !input.updateExisting)
                throw new AccountInputError(
                    'Essa conta já existe. Use --atualizar explicitamente para redefini-la.',
                );
            if (!existing && input.updateExisting)
                throw new AccountInputError(
                    'Conta não encontrada. Remova --atualizar para criar uma nova conta.',
                );
            // Conta nova nunca recebe administrador por omissão. Existente mantém o perfil.
            const roleKey = input.roleKey ?? existing?.role.key ?? 'leitura';
            const role = await tx.role.findUnique({ where: { key: roleKey } });
            if (!role)
                throw new AccountInputError(
                    'Perfil não encontrado. Execute o bootstrap antes de criar contas.',
                );
            if (
                existing?.role.key === 'admin' &&
                role.key !== 'admin' &&
                existing.status === 'ATIVO'
            ) {
                const admins = await tx.user.count({
                    where: { status: 'ATIVO', role: { key: 'admin' } },
                });
                if (admins <= 1)
                    throw new AccountInputError(
                        'Não é permitido remover o último administrador ativo.',
                    );
            }
            const regional = input.regionalSlug
                ? await tx.regional.findUnique({ where: { slug: input.regionalSlug } })
                : null;
            if (input.regionalSlug && !regional)
                throw new AccountInputError('Regional não encontrada.');
            const name = input.name ?? existing?.name ?? input.email;
            const data = {
                name,
                initials: initials(name),
                passwordHash: null,
                roleId: role.id,
                status: 'ATIVO' as const,
                mustChangePassword: false,
                mfaRequired: true,
                failedLoginCount: 0,
                lockedUntil: null,
                inviteTokenHash: null,
                inviteExpiresAt: null,
                resetTokenHash: null,
                resetExpiresAt: null,
                ...(regional ? { regionalId: regional.id } : {}),
            };
            const user = existing
                ? await tx.user.update({ where: { id: existing.id }, data, select: { id: true } })
                : await tx.user.create({
                      data: { ...data, email: input.email },
                      select: { id: true },
                  });
            const revoked = await tx.session.updateMany({
                where: { userId: user.id, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            await tx.auditLog.create({
                data: {
                    userId: user.id,
                    actorLabel: 'operator-cli',
                    level: 'ALERTA',
                    action: existing ? 'Conta redefinida pela CLI' : 'Conta criada pela CLI',
                    target: 'Conta administrativa',
                },
            });
            return { created: !existing, revokedSessions: revoked.count };
        },
        { maxWait: 10_000, timeout: 30_000 },
    );
}
