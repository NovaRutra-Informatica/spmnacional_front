import 'server-only';

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, isMailEnabled } from './env';

/**
 * Envio de e-mail transacional.
 *
 * Pensado para o Google Workspace da organização: basta uma Senha de App da
 * conta institucional em SMTP_USER/SMTP_PASSWORD, ou o SMTP relay do Workspace.
 *
 * Sem SMTP configurado, `sendMail` devolve `false` sem lançar — o formulário
 * continua gravando no banco e a equipe vê a mensagem no painel.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
    if (!isMailEnabled()) return null;
    if (transporter) return transporter;

    transporter = nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure,
        auth: { user: env.mail.user, pass: env.mail.password },
    });

    return transporter;
}

export interface MailInput {
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
}

export async function sendMail(input: MailInput): Promise<boolean> {
    const transport = getTransporter();

    if (!transport) {
        console.info(
            `[e-mail] SMTP não configurado — mensagem "${input.subject}" não foi enviada para ${
                Array.isArray(input.to) ? input.to.join(', ') : input.to
            }.`,
        );
        return false;
    }

    try {
        await transport.sendMail({
            from: env.mail.from,
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html ?? htmlFromText(input.text),
            replyTo: input.replyTo,
        });
        return true;
    } catch (error) {
        console.error('[e-mail] falha no envio:', error);
        return false;
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function htmlFromText(text: string): string {
    const body = text
        .split(/\n{2,}/)
        .map(
            (paragraph) =>
                `<p style="margin:0 0 16px">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`,
        )
        .join('');

    return `<!doctype html><html lang="pt-br"><body style="margin:0;background:#f4f6f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#333">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6ebf1">
  <div style="background:#004a99;color:#fff;padding:20px 24px">
    <strong style="font-size:18px">SPM — Serviço Pastoral dos Migrantes</strong>
  </div>
  <div style="padding:24px;font-size:15px;line-height:1.6">${body}</div>
  <div style="padding:16px 24px;background:#f8f9fa;color:#767676;font-size:12px">
    Esta é uma mensagem automática do site do Serviço Pastoral dos Migrantes.
  </div>
</div></body></html>`;
}

// ---------------------------------------------------------
// Mensagens do sistema
// ---------------------------------------------------------

export async function sendContactNotification(message: {
    name: string;
    email: string;
    subject: string;
    city?: string | null;
    phone?: string | null;
    language: string;
    message: string;
}): Promise<boolean> {
    return sendMail({
        to: env.mail.notifyTo,
        replyTo: message.email,
        subject: `[Fale Conosco] ${message.subject} — ${message.name}`,
        text: [
            `Nova mensagem recebida pelo site.`,
            ``,
            `Nome: ${message.name}`,
            `E-mail: ${message.email}`,
            `Telefone: ${message.phone || '—'}`,
            `Cidade: ${message.city || '—'}`,
            `Assunto: ${message.subject}`,
            `Idioma preferido para resposta: ${message.language}`,
            ``,
            `Mensagem:`,
            message.message,
            ``,
            `Responda pelo painel: ${env.appUrl}/admin/mensagens`,
        ].join('\n'),
    });
}

export async function sendContactAcknowledgement(message: {
    name: string;
    email: string;
}): Promise<boolean> {
    return sendMail({
        to: message.email,
        subject: 'Recebemos sua mensagem — SPM',
        text: [
            `Olá, ${message.name}.`,
            ``,
            `Recebemos sua mensagem e ela já está com a nossa equipe. Respondemos em até 5 dias úteis.`,
            ``,
            `Se a sua situação for urgente, procure a equipe do SPM mais próxima em ${env.appUrl}/onde-estamos ou ligue para o Disque 100 (Direitos Humanos).`,
            ``,
            `Serviço Pastoral dos Migrantes`,
        ].join('\n'),
    });
}

export async function sendUserInvite(user: {
    name: string;
    email: string;
    inviteUrl: string;
    roleName: string;
}): Promise<boolean> {
    return sendMail({
        to: user.email,
        subject: 'Seu acesso ao painel do SPM',
        text: [
            `Olá, ${user.name}.`,
            ``,
            `A coordenação criou um acesso para você no painel do Serviço Pastoral dos Migrantes, com o perfil "${user.roleName}".`,
            ``,
            `Defina sua senha neste link (válido por 7 dias):`,
            user.inviteUrl,
            ``,
            `O painel dá acesso a dados de pessoas atendidas. Nunca compartilhe suas credenciais.`,
            ``,
            `Serviço Pastoral dos Migrantes`,
        ].join('\n'),
    });
}

export async function sendNewsletterConfirmation(subscriber: {
    email: string;
    confirmUrl: string;
}): Promise<boolean> {
    return sendMail({
        to: subscriber.email,
        subject: 'Confirme sua inscrição no boletim do SPM',
        text: [
            `Recebemos um pedido de inscrição no boletim do Serviço Pastoral dos Migrantes com este e-mail.`,
            ``,
            `Para confirmar, acesse:`,
            subscriber.confirmUrl,
            ``,
            `Se não foi você, ignore esta mensagem — nada será enviado.`,
            ``,
            `Serviço Pastoral dos Migrantes`,
        ].join('\n'),
    });
}
