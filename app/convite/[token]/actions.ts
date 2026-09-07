'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { UserStatus } from '@/lib/generated/prisma/enums';
import { actionError, formString, zodErrors, type ActionState } from '@/lib/server/actions';
import { recordAudit } from '@/lib/server/audit';
import { createSession } from '@/lib/server/auth';
import { hashPassword, hashToken } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';

/**
 * Aceite de convite: como quem chega aqui ainda não tem conta ativa nem sessão,
 * a ação não passa por `runAction`. O convite é a credencial — por isso ele é
 * conferido de novo no servidor, e não apenas na hora de abrir a página.
 */

const schema = z
    .object({
        senha: z
            .string()
            .min(12, 'A senha precisa ter pelo menos 12 caracteres.')
            .max(128, 'A senha deve ter no máximo 128 caracteres.'),
        confirmacao: z.string().min(1, 'Repita a senha para confirmar.').max(128),
    })
    .refine((valores) => valores.senha === valores.confirmacao, {
        path: ['confirmacao'],
        message: 'As senhas não conferem.',
    });

export async function definirSenha(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const token = formString(formData, 'token');

    // Senhas não passam por `formString`: aparar espaços mudaria o que a pessoa digitou.
    const senhaBruta = formData.get('senha');
    const confirmacaoBruta = formData.get('confirmacao');

    const parsed = schema.safeParse({
        senha: typeof senhaBruta === 'string' ? senhaBruta : '',
        confirmacao: typeof confirmacaoBruta === 'string' ? confirmacaoBruta : '',
    });

    if (!parsed.success) {
        return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
    }

    // Guardado fora do `try` porque a revalidação da ficha da pessoa acontece
    // depois do bloco, junto com o redirecionamento.
    let usuarioId = '';

    try {
        // O filtro por `PENDENTE` é o que impede uma conta desativada de voltar
        // sozinha ao ar: desativar não apaga o convite que ainda não foi aceito.
        const usuario = await prisma.user.findFirst({
            where: {
                inviteTokenHash: hashToken(token),
                inviteExpiresAt: { gt: new Date() },
                status: UserStatus.PENDENTE,
            },
            select: { id: true, email: true },
        });

        if (!usuario) {
            return actionError(
                'Este convite expirou ou já foi utilizado. Peça um novo à coordenação.',
            );
        }

        await prisma.user.update({
            where: { id: usuario.id },
            data: {
                passwordHash: await hashPassword(parsed.data.senha),
                // O convite é de uso único: some do banco assim que é aceito.
                inviteTokenHash: null,
                inviteExpiresAt: null,
                status: UserStatus.ATIVO,
                mustChangePassword: false,
                failedLoginCount: 0,
                lockedUntil: null,
                lastAccessAt: new Date(),
            },
        });

        await recordAudit({
            action: 'Convite aceito e senha definida',
            target: usuario.email,
            userId: usuario.id,
            actorLabel: usuario.email,
        });

        await createSession(usuario.id);
        usuarioId = usuario.id;
    } catch (error) {
        console.error('[convite] falha ao definir a senha:', error);
        return actionError('Não foi possível concluir a ativação. Tente novamente em instantes.');
    }

    // A conta passou de PENDENTE para ATIVO: as telas de gestão mudam.
    revalidatePath('/admin/usuarios');
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    revalidatePath('/admin/acessos');
    // O painel exibe a contagem de contas por situação.
    revalidatePath('/admin');

    // `redirect()` sinaliza por exceção — fica fora do try para não ser engolido.
    redirect('/admin');
}
