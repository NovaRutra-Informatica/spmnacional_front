'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import { actionError, actionOk, formString, runAction } from '@/lib/server/actions';
import { ADMIN_ROLE_KEY, isAdminGeral } from '../usuarios/politica';

/**
 * Concede ou revoga uma permissão de um perfil.
 *
 * A célula da matriz é um botão único dentro do próprio formulário: não há
 * estado de formulário para exibir, o resultado aparece na própria célula
 * depois do `revalidatePath`. Por isso o `ActionState` devolvido por
 * `runAction` é descartado — ele existe aqui só para tratar sessão, permissão
 * e exceção de forma uniforme.
 */
export async function alternarPermissao(formData: FormData): Promise<void> {
    await runAction('usuarios', async (user) => {
        if (!isAdminGeral(user)) {
            return actionError('Somente administradores gerais podem alterar permissões.');
        }

        const roleId = formString(formData, 'roleId');
        const permissionKey = formString(formData, 'permissionKey');

        if (!roleId || !permissionKey) {
            return actionError('Permissão ou perfil não identificados.');
        }

        const [role, permission] = await Promise.all([
            prisma.role.findUnique({
                where: { id: roleId },
                select: { id: true, key: true, name: true },
            }),
            prisma.permission.findUnique({
                where: { key: permissionKey },
                select: { key: true, label: true },
            }),
        ]);

        if (!role) return actionError('Perfil não encontrado.');
        if (!permission) return actionError('Permissão não encontrada.');

        // Revogar algo do administrador geral deixaria a organização sem
        // ninguém capaz de devolver a permissão depois.
        if (role.key === ADMIN_ROLE_KEY) {
            return actionError('O perfil de administrador geral mantém todas as permissões.');
        }

        const atual = await prisma.rolePermission.findUnique({
            where: { roleId_permissionKey: { roleId: role.id, permissionKey: permission.key } },
            select: { roleId: true },
        });

        // Tirar "usuarios" do próprio perfil fecharia esta tela para quem está
        // agindo — e não haveria como voltar a abri-la sem outra conta.
        if (atual && role.id === user.role.id && permission.key === 'usuarios') {
            return actionError(
                'Você não pode revogar a permissão de usuários do seu próprio perfil.',
            );
        }

        if (atual) {
            await prisma.rolePermission.delete({
                where: {
                    roleId_permissionKey: { roleId: role.id, permissionKey: permission.key },
                },
            });
        } else {
            await prisma.rolePermission.create({
                data: { roleId: role.id, permissionKey: permission.key },
            });
        }

        await recordAudit({
            action: atual ? 'Permissão revogada' : 'Permissão concedida',
            target: `${role.name} · ${permission.label}`,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
            metadata: { perfil: role.key, permissao: permission.key, concedida: !atual },
        });

        revalidatePath('/admin/acessos');
        revalidatePath('/admin/usuarios');
        // O menu lateral é montado a partir das permissões do perfil.
        revalidatePath('/admin', 'layout');

        return actionOk();
    });
}
