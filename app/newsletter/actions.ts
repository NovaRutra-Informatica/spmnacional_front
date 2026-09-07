'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formString } from '@/lib/server/actions';
import { recordAudit, requestMeta } from '@/lib/server/audit';
import { generateToken, hashToken } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';
import { env, isMailEnabled } from '@/lib/server/env';
import { sendNewsletterConfirmation } from '@/lib/server/mail';
import { consumeRateLimit } from '@/lib/server/rate-limit';

/**
 * Inscrição no boletim, a partir do rodapé da home.
 *
 * Ação pública: sem sessão e sem `runAction`. O e-mail só entra na lista depois
 * de confirmado por link (dupla confirmação) — assim ninguém inscreve terceiros.
 * Sem SMTP a inscrição não é ativada: a dupla confirmação nunca é contornada.
 */

interface NewsletterFormState {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string>;
    data?: Record<string, unknown>;
}

const schema = z.object({
    email: z.email('Informe um e-mail válido.').max(180, 'E-mail muito longo.'),
});

export async function inscrever(
    _prev: NewsletterFormState,
    formData: FormData,
): Promise<NewsletterFormState> {
    try {
        // Mesma isca do Fale Conosco: campo oculto preenchido só por robô.
        if (formString(formData, 'website')) {
            return { ok: true, message: 'Inscrição registrada. Obrigado!' };
        }

        const parsed = schema.safeParse({ email: formString(formData, 'email') });
        if (!parsed.success) {
            const erro = parsed.error.issues[0]?.message ?? 'Informe um e-mail válido.';
            return { ok: false, message: erro, fieldErrors: { email: erro } };
        }

        const email = parsed.data.email.toLowerCase();

        if (!isMailEnabled()) {
            return {
                ok: false,
                message: 'O boletim está temporariamente indisponível. Tente novamente mais tarde.',
            };
        }

        const meta = await requestMeta();
        const limits = [
            consumeRateLimit({
                scope: 'newsletter-global',
                identifier: 'all',
                limit: 100,
                windowMs: 60 * 60 * 1000,
            }),
            consumeRateLimit({
                scope: 'newsletter-address',
                identifier: email,
                limit: 3,
                windowMs: 60 * 60 * 1000,
            }),
        ];

        if (meta.ip) {
            limits.push(
                consumeRateLimit({
                    scope: 'newsletter-source',
                    identifier: meta.ip,
                    limit: 10,
                    windowMs: 60 * 60 * 1000,
                }),
            );
        }

        const limitResults = await Promise.all(limits);

        if (limitResults.some((result) => !result.allowed)) {
            return {
                ok: false,
                message:
                    'Muitas solicitações foram feitas desta conexão. Aguarde antes de tentar novamente.',
            };
        }

        const existing = await prisma.newsletterSubscriber.findUnique({
            where: { email },
            select: { confirmed: true },
        });

        if (existing?.confirmed) {
            return {
                ok: true,
                message:
                    'Se este endereço puder receber o boletim, enviaremos as instruções necessárias.',
            };
        }

        const token = generateToken();
        const confirmExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await prisma.newsletterSubscriber.upsert({
            where: { email },
            create: {
                email,
                source: 'site',
                confirmed: false,
                confirmedAt: null,
                confirmTokenHash: hashToken(token),
                confirmExpiresAt,
            },
            update: {
                confirmed: false,
                confirmedAt: null,
                confirmTokenHash: hashToken(token),
                confirmExpiresAt,
                // Reinscrição depois de um cancelamento volta a valer.
                unsubscribedAt: null,
            },
        });

        await recordAudit({
            action: 'Inscrição no boletim (aguardando confirmação)',
            target: 'Endereço de boletim não confirmado',
            actorLabel: 'site público',
        });

        revalidatePath('/admin/configuracoes');

        const base = env.appUrl.replace(/\/$/, '');
        const confirmUrl = `${base}/newsletter/confirmar?token=${encodeURIComponent(token)}`;
        const sent = await sendNewsletterConfirmation({ email, confirmUrl });

        if (!sent) {
            return {
                ok: false,
                message:
                    'Não conseguimos enviar o e-mail de confirmação agora. Tente novamente em alguns minutos.',
            };
        }

        return {
            ok: true,
            message: 'Enviamos um e-mail de confirmação. Abra o link para concluir a inscrição.',
        };
    } catch (error) {
        console.error('[newsletter] falha ao registrar inscrição:', error);
        return {
            ok: false,
            message: 'Não foi possível concluir a inscrição agora. Tente novamente mais tarde.',
        };
    }
}
