import 'server-only';

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, isMailEnabled } from './env';
import { logError } from './logger';

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
        requireTLS: !env.mail.secure,
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
        disableFileAccess: true,
        disableUrlAccess: true,
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
    /** Stable operational outbox identity; retries reuse the same Message-ID. */
    messageId?: string;
}

export async function sendMail(input: MailInput): Promise<boolean> {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    // Cabeçalhos nunca recebem caracteres de controle vindos de formulários.
    if (
        recipients.length === 0 ||
        recipients.length > 50 ||
        [
            ...recipients,
            input.subject,
            input.replyTo ?? '',
            input.messageId ?? '',
            env.mail.from,
        ].some((value) => /[\u0000-\u001f\u007f]/.test(value)) ||
        (input.messageId !== undefined &&
            !/^<[a-zA-Z0-9._-]{1,128}@[a-zA-Z0-9.-]{1,253}>$/.test(input.messageId))
    ) {
        console.error('[e-mail] cabeçalho inválido; envio recusado');
        return false;
    }
    const transport = getTransporter();

    if (!transport) {
        console.info('[e-mail] SMTP não configurado; notificação não enviada');
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
            messageId: input.messageId,
        });
        return true;
    } catch (error) {
        // Erros SMTP podem conter destinatários, respostas do servidor ou URLs
        // com tokens. Dados pessoais não devem acabar no Cloud Logging.
        logError('mail.delivery_failed', error);
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

export async function sendContactNotification(
    message: {
        name: string;
        email: string;
        subject: string;
        city?: string | null;
        phone?: string | null;
        language: string;
        message: string;
    },
    messageId?: string,
): Promise<boolean> {
    return sendMail({
        to: env.mail.notifyTo,
        replyTo: message.email,
        subject: `[Fale Conosco] ${message.subject} — ${message.name}`,
        messageId,
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

export async function sendContactAcknowledgement(
    message: {
        name: string;
        email: string;
    },
    messageId?: string,
): Promise<boolean> {
    return sendMail({
        to: message.email,
        subject: 'Recebemos sua mensagem — SPM',
        messageId,
        text: [
            `Olá, ${message.name}.`,
            ``,
            `Recebemos sua mensagem e ela já está com a nossa equipe. Responderemos o mais breve possível.`,
            ``,
            `Se a sua situação for urgente, procure a equipe do SPM mais próxima em ${env.appUrl}/onde-estamos ou ligue para o Disque 100 (Direitos Humanos).`,
            ``,
            `Serviço Pastoral dos Migrantes`,
        ].join('\n'),
    });
}

export async function sendUserInvite(
    user: {
        name: string;
        email: string;
        inviteUrl: string;
        roleName: string;
    },
    messageId?: string,
): Promise<boolean> {
    return sendMail({
        to: user.email,
        subject: 'Seu acesso ao painel do SPM',
        messageId,
        text: [
            `Olá, ${user.name}.`,
            ``,
            `A coordenação criou um acesso para você no painel do Serviço Pastoral dos Migrantes, com o perfil "${user.roleName}".`,
            ``,
            `Entre com este e-mail institucional pelo Google Workspace:`,
            user.inviteUrl,
            ``,
            `Não há senha local. Use a verificação em duas etapas exigida pela organização. Nunca compartilhe suas credenciais.`,
            ``,
            `Serviço Pastoral dos Migrantes`,
        ].join('\n'),
    });
}

export async function sendNewsletterConfirmation(
    subscriber: {
        email: string;
        confirmUrl: string;
    },
    messageId?: string,
): Promise<boolean> {
    return sendMail({
        to: subscriber.email,
        subject: 'Confirme sua inscrição no boletim do SPM',
        messageId,
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
