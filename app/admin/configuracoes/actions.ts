'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { recordAudit } from '@/lib/server/audit';
import { PASSWORD_DISABLED } from '@/lib/server/auth';
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

/** Legacy action cannot create credentials or refresh sessions. */
export async function alterarSenha(_prev: ActionState, _formData: FormData): Promise<ActionState> {
    void _prev;
    void _formData;
    return actionError(PASSWORD_DISABLED);
}
