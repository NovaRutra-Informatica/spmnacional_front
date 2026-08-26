'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formString, zodErrors } from '@/lib/server/actions';
import { recordAudit, requestMeta } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';
import { sendContactAcknowledgement, sendContactNotification } from '@/lib/server/mail';
import { CONTACT_LANGUAGES, CONTACT_SUBJECTS, DEFAULT_CONTACT_LANGUAGE } from './options';

/**
 * Envio do formulário público de contato.
 *
 * Não usa `runAction` de propósito: aqui não há sessão nem permissão — quem
 * escreve é uma pessoa migrante, um voluntário ou um jornalista. O tratamento
 * de erro é próprio, mas o formato devolvido é o mesmo do painel para que o
 * `useActionState` do cliente não precise de um contrato diferente.
 */

interface ContactFormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const SUCCESS_MESSAGE =
    'Recebemos seu contato e nossa equipe responde em até 5 dias úteis no e-mail informado.';

const contactSchema = z.object({
    name: z
        .string()
        .min(2, 'Informe seu nome com pelo menos 2 caracteres.')
        .max(120, 'Nome muito longo.'),
    email: z
        .email('Informe um e-mail válido para que possamos responder.')
        .max(180, 'E-mail muito longo.'),
    phone: z.string().max(40, 'Telefone muito longo.'),
    city: z.string().max(120, 'Cidade muito longa.'),
    subject: z.enum(CONTACT_SUBJECTS, 'Selecione o motivo do contato.'),
    language: z.enum(CONTACT_LANGUAGES, 'Selecione um idioma da lista.'),
    message: z
        .string()
        .min(20, 'Conte um pouco mais: escreva ao menos 20 caracteres.')
        .max(5000, 'Mensagem muito longa. Resuma em até 5.000 caracteres.'),
});

export async function enviarMensagem(
    _prev: ContactFormState,
    formData: FormData,
): Promise<ContactFormState> {
    const values = {
        name: formString(formData, 'name'),
        email: formString(formData, 'email'),
        phone: formString(formData, 'phone'),
        city: formString(formData, 'city'),
        subject: formString(formData, 'subject'),
        language: formString(formData, 'language') || DEFAULT_CONTACT_LANGUAGE,
        message: formString(formData, 'message'),
    };

    try {
        // Armadilha para robôs: o campo fica oculto e fora da navegação por teclado,
        // então só um preenchedor automático o completa. Fingimos sucesso para não
        // ensinar ao robô qual é o critério de rejeição.
        if (formString(formData, 'website')) {
            return { ok: true, message: SUCCESS_MESSAGE };
        }

        const parsed = contactSchema.safeParse(values);
        if (!parsed.success) {
            return {
                ok: false,
                message: 'Verifique os campos destacados.',
                fieldErrors: zodErrors(parsed.error),
                data: { values },
            };
        }

        const input = parsed.data;
        const meta = await requestMeta();

        const saved = await prisma.contactMessage.create({
            data: {
                name: input.name,
                email: input.email.toLowerCase(),
                phone: input.phone || null,
                city: input.city || null,
                subject: input.subject,
                language: input.language,
                message: input.message,
                ip: meta.ip,
                userAgent: meta.userAgent,
            },
            select: { id: true },
        });

        // A mensagem já está gravada e visível no painel: o e-mail é notificação,
        // não pode derrubar o envio se o SMTP estiver fora do ar.
        await Promise.allSettled([
            sendContactNotification({
                name: input.name,
                email: input.email,
                subject: input.subject,
                city: input.city || null,
                phone: input.phone || null,
                language: input.language,
                message: input.message,
            }),
            sendContactAcknowledgement({ name: input.name, email: input.email }),
        ]);

        await recordAudit({
            action: 'Mensagem recebida pelo Fale Conosco',
            target: `${input.subject} — ${input.name}`,
            actorLabel: 'site público',
            metadata: { contactMessageId: saved.id, language: input.language },
        });

        revalidatePath('/admin/mensagens');
        revalidatePath('/admin');

        return { ok: true, message: SUCCESS_MESSAGE, data: { id: saved.id } };
    } catch (error) {
        console.error('[fale-conosco] falha ao registrar mensagem:', error);
        return {
            ok: false,
            message:
                'Não conseguimos registrar sua mensagem agora. Tente novamente em alguns minutos ou escreva para contato@spmnacional.org.br.',
            data: { values },
        };
    }
}
