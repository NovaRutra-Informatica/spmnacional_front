'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import { createSession, revokeAllSessions } from '@/lib/server/auth';
import { hashPassword, verifyPassword } from '@/lib/server/crypto';
import {
    actionError,
    actionOk,
    formBoolean,
    formString,
    runAction,
    zodErrors,
    type ActionState,
} from '@/lib/server/actions';
import { getSiteSettings, SITE_SETTINGS_KEY, type SiteSettings } from '@/lib/server/queries';

/**
 * Configurações do site.
 *
 * Tudo mora em uma única linha de `SiteSetting` (chave "site"), no formato da
 * interface `SiteSettings`. Cada aba grava só os seus campos: o restante é
 * preservado a partir do valor atual.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Endereço de rede opcional — em branco significa "não exibir". */
const urlOpcional = z
    .string()
    .refine(
        (value) => !value || /^https?:\/\//i.test(value),
        'Informe um endereço começando com http:// ou https://.',
    );

const institucionalSchema = z.object({
    siteName: z.string().min(3, 'Informe o nome do site.'),
    tagline: z.string().min(3, 'Informe a assinatura institucional.'),
    description: z
        .string()
        .min(20, 'A descrição precisa de pelo menos 20 caracteres.')
        .max(300, 'A descrição deve ter no máximo 300 caracteres.'),
});

const contatoSchema = z.object({
    address: z.string().min(5, 'Informe o endereço.'),
    city: z.string().min(2, 'Informe a cidade e a UF.'),
    zip: z.string().max(12, 'Informe um CEP válido.'),
    phone: z.string().max(40, 'Informe um telefone válido.'),
    email: z.string().refine((value) => EMAIL_REGEX.test(value), 'Informe um e-mail válido.'),
    hours: z.string().max(160, 'Descreva o horário em até 160 caracteres.'),
    instagram: urlOpcional,
    facebook: urlOpcional,
    youtube: urlOpcional,
    whatsapp: urlOpcional,
});

/** Grava o objeto completo, preservando o que a aba atual não edita. */
async function gravarSettings(alteracoes: Partial<SiteSettings>): Promise<SiteSettings> {
    const atual = await getSiteSettings();
    const proximo: SiteSettings = { ...atual, ...alteracoes };

    await prisma.siteSetting.upsert({
        where: { key: SITE_SETTINGS_KEY },
        // O spread devolve um objeto simples, que é o formato aceito no campo Json.
        create: { key: SITE_SETTINGS_KEY, value: { ...proximo } },
        update: { value: { ...proximo } },
    });

    // As configurações aparecem no cabeçalho e no rodapé de todas as páginas.
    revalidatePath('/', 'layout');
    revalidatePath('/admin/configuracoes');

    return proximo;
}

export async function salvarInstitucional(
    _prev: ActionState,
    formData: FormData,
): Promise<ActionState> {
    return runAction('config', async (user) => {
        const parsed = institucionalSchema.safeParse({
            siteName: formString(formData, 'siteName'),
            tagline: formString(formData, 'tagline'),
            description: formString(formData, 'description'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        await gravarSettings(parsed.data);

        await recordAudit({
            action: 'Configurações institucionais alteradas',
            target: parsed.data.siteName,
            userId: user.id,
            actorLabel: user.email,
        });

        return actionOk('Identidade institucional salva.');
    });
}

export async function salvarContato(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('config', async (user) => {
        const parsed = contatoSchema.safeParse({
            address: formString(formData, 'address'),
            city: formString(formData, 'city'),
            zip: formString(formData, 'zip'),
            phone: formString(formData, 'phone'),
            email: formString(formData, 'email'),
            hours: formString(formData, 'hours'),
            instagram: formString(formData, 'instagram'),
            facebook: formString(formData, 'facebook'),
            youtube: formString(formData, 'youtube'),
            whatsapp: formString(formData, 'whatsapp'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        await gravarSettings(parsed.data);

        await recordAudit({
            action: 'Dados de contato do site alterados',
            target: parsed.data.email,
            userId: user.id,
            actorLabel: user.email,
        });

        return actionOk('Contatos e redes sociais salvos.');
    });
}

export async function salvarSite(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('config', async (user) => {
        const alteracoes = {
            showStickyDonate: formBoolean(formData, 'showStickyDonate'),
            showNewsletter: formBoolean(formData, 'showNewsletter'),
            showCookieNotice: formBoolean(formData, 'showCookieNotice'),
            maintenance: formBoolean(formData, 'maintenance'),
        };

        await gravarSettings(alteracoes);

        await recordAudit({
            action: alteracoes.maintenance
                ? 'Modo manutenção do site ativado'
                : 'Comportamento do site público alterado',
            target: 'Site público',
            level: alteracoes.maintenance ? 'ALERTA' : 'INFO',
            userId: user.id,
            actorLabel: user.email,
            metadata: alteracoes,
        });

        return actionOk('Preferências do site salvas.');
    });
}

// ---------------------------------------------------------
// Conta
// ---------------------------------------------------------

const senhaSchema = z
    .object({
        currentPassword: z.string().min(1, 'Informe a senha atual.').max(128),
        newPassword: z
            .string()
            .min(12, 'A nova senha precisa de pelo menos 12 caracteres.')
            .max(128, 'A nova senha deve ter no máximo 128 caracteres.'),
        confirmPassword: z.string().min(1, 'Repita a nova senha.').max(128),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        path: ['confirmPassword'],
        message: 'A confirmação não corresponde à nova senha.',
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
        path: ['newPassword'],
        message: 'A nova senha precisa ser diferente da atual.',
    });

export async function alterarSenha(_prev: ActionState, formData: FormData): Promise<ActionState> {
    return runAction('config', async (user) => {
        const parsed = senhaSchema.safeParse({
            currentPassword: formString(formData, 'currentPassword'),
            newPassword: formString(formData, 'newPassword'),
            confirmPassword: formString(formData, 'confirmPassword'),
        });

        if (!parsed.success) {
            return actionError('Verifique os campos destacados.', zodErrors(parsed.error));
        }

        const conta = await prisma.user.findUnique({
            where: { id: user.id },
            select: { passwordHash: true },
        });

        if (!conta?.passwordHash) {
            return actionError(
                'Esta conta entra apenas por Google Workspace e não tem senha para trocar.',
            );
        }

        const confere = await verifyPassword(parsed.data.currentPassword, conta.passwordHash);

        if (!confere) {
            await recordAudit({
                action: 'Troca de senha recusada (senha atual incorreta)',
                target: user.email,
                level: 'ALERTA',
                userId: user.id,
                actorLabel: user.email,
            });

            return actionError('Verifique os campos destacados.', {
                currentPassword: 'A senha atual não confere.',
            });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: await hashPassword(parsed.data.newPassword),
                mustChangePassword: false,
                failedLoginCount: 0,
                lockedUntil: null,
            },
        });

        // Trocar a senha derruba tudo o que estava aberto; a aba atual recebe uma
        // sessão nova para que a pessoa não precise entrar de novo.
        await revokeAllSessions(user.id);
        await createSession(user.id);

        await recordAudit({
            action: 'Senha alterada pela própria pessoa',
            target: user.email,
            userId: user.id,
            actorLabel: user.email,
        });

        revalidatePath('/admin/configuracoes');
        return actionOk('Senha atualizada. As outras sessões abertas foram encerradas.');
    });
}
