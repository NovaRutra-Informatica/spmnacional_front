'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { formString } from '@/lib/server/actions';
import { recordAudit, requestMeta } from '@/lib/server/audit';
import { generateToken, hashToken } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';
import { env, isMailEnabled } from '@/lib/server/env';
import { encryptNewsletterEmail } from '@/lib/server/generic-email-outbox';
import { withPublicNewsletterDatabaseScope } from '@/lib/server/database-scope';
import { isIdempotencyClaimConflict } from '@/lib/server/contact-idempotency';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { assertTrustedMutationOrigin, UntrustedOriginError } from '@/lib/server/request-origin';
import { logError } from '@/lib/server/logger';

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
        await assertTrustedMutationOrigin();
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
            select: { id: true, confirmed: true },
        });

        if (existing?.confirmed) {
            return {
                ok: true,
                message:
                    'Se este endereço puder receber o boletim, enviaremos as instruções necessárias.',
            };
        }

        const token = generateToken();
        const tokenHash = hashToken(token);
        const confirmExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const confirmUrl = new URL('/newsletter/confirmar', env.appUrl);
        confirmUrl.searchParams.set('token', token);
        const payloadEncrypted = encryptNewsletterEmail({ email, confirmUrl: confirmUrl.href });
        const queue = (subscriberId: string, exists: boolean) =>
            withPublicNewsletterDatabaseScope(
                () =>
                    prisma.$transaction(
                        async (tx) => {
                            if (exists) {
                                // A confirmation racing this request cannot be undone.
                                const updated = await tx.newsletterSubscriber.updateMany({
                                    where: { id: subscriberId, confirmed: false },
                                    data: {
                                        confirmTokenHash: tokenHash,
                                        confirmExpiresAt,
                                        unsubscribedAt: null,
                                    },
                                });
                                if (updated.count !== 1) return false;
                            } else {
                                await tx.newsletterSubscriber.create({
                                    data: {
                                        id: subscriberId,
                                        email,
                                        source: 'site',
                                        confirmed: false,
                                        confirmTokenHash: tokenHash,
                                        confirmExpiresAt,
                                        unsubscribedAt: null,
                                    },
                                    select: { id: true },
                                });
                            }
                            await tx.genericEmailJob.create({
                                data: {
                                    kind: 'NEWSLETTER_CONFIRMATION',
                                    newsletterSubscriberId: subscriberId,
                                    versionHash: tokenHash,
                                    payloadEncrypted,
                                    expiresAt: confirmExpiresAt,
                                },
                                select: { id: true },
                            });
                            return true;
                        },
                        { maxWait: 5_000, timeout: 10_000 },
                    ),
                { subscriberId, tokenHash },
            );
        let queued: boolean;
        try {
            queued = await queue(existing?.id ?? randomUUID(), Boolean(existing));
        } catch (error) {
            if (!isIdempotencyClaimConflict(error) || existing) throw error;
            const winner = await prisma.newsletterSubscriber.findUnique({
                where: { email },
                select: { id: true, confirmed: true },
            });
            if (!winner) throw error;
            queued = winner.confirmed ? false : await queue(winner.id, true);
        }
        if (!queued)
            return {
                ok: true,
                message:
                    'Se este endereço puder receber o boletim, enviaremos as instruções necessárias.',
            };

        await recordAudit({
            action: 'Inscrição no boletim (aguardando confirmação)',
            target: 'Endereço de boletim não confirmado',
            actorLabel: 'site público',
        });

        revalidatePath('/admin/configuracoes');

        return {
            ok: true,
            message: isMailEnabled()
                ? 'Você receberá o link de confirmação por e-mail. Abra-o para concluir a inscrição.'
                : 'Pedido registrado, mas a confirmação por e-mail está momentaneamente indisponível. A inscrição ainda não está ativa; tente novamente quando o serviço estiver disponível.',
        };
    } catch (error) {
        if (error instanceof UntrustedOriginError) return { ok: false, message: error.message };
        logError('newsletter.subscribe_failed', error);
        return {
            ok: false,
            message: 'Não foi possível concluir a inscrição agora. Tente novamente mais tarde.',
        };
    }
}
