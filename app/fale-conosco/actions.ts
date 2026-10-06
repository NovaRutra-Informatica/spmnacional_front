'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formString, zodErrors } from '@/lib/server/actions';
import { requestMeta } from '@/lib/server/audit';
import { encryptSensitive } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { assertTrustedMutationOrigin, UntrustedOriginError } from '@/lib/server/request-origin';
import { logError } from '@/lib/server/logger';
import { withPublicContactDatabaseScope } from '@/lib/server/database-scope';
import {
    CONTACT_ATTEMPT_TTL_MS,
    contactAttemptKeyHash,
    contactPayloadHash,
    contactReplayStatus,
    isIdempotencyClaimConflict,
} from '@/lib/server/contact-idempotency';
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

const SUCCESS_MESSAGE = 'Recebemos seu contato. Responderemos o mais breve possível.';

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
    // Preserve useful field values after errors without reflecting oversized input.
    const echoedValues = {
        name: values.name.slice(0, 120),
        email: values.email.slice(0, 180),
        phone: values.phone.slice(0, 40),
        city: values.city.slice(0, 120),
        subject: values.subject.slice(0, 80),
        language: values.language.slice(0, 80),
        message: values.message.slice(0, 5000),
    };

    try {
        await assertTrustedMutationOrigin();
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
                data: { values: echoedValues },
            };
        }

        const input = parsed.data;
        const keyHash = contactAttemptKeyHash(formString(formData, 'idempotencyKey'));
        if (!keyHash) {
            return {
                ok: false,
                message:
                    'A tentativa de envio não é válida. Prepare um novo envio e tente novamente.',
                fieldErrors: { idempotencyKey: 'Prepare um novo envio.' },
                data: { values: echoedValues },
            };
        }
        const payloadHash = contactPayloadHash(input);
        const scope = { keyHash, payloadHash };
        const attemptSelect = { payloadHash: true, expiresAt: true } as const;
        const replayResponse = (existing: {
            payloadHash: string;
            expiresAt: Date;
        }): ContactFormState => {
            const status = contactReplayStatus(existing, payloadHash);
            if (status === 'replay') return { ok: true, message: SUCCESS_MESSAGE };
            const message =
                status === 'expired'
                    ? 'Esta tentativa expirou. Prepare um novo envio.'
                    : 'Esta tentativa já foi registrada com outro conteúdo. Prepare um novo envio.';
            return {
                ok: false,
                message,
                fieldErrors: { idempotencyKey: message },
                data: { values: echoedValues },
            };
        };
        const readAttempt = () =>
            withPublicContactDatabaseScope(
                () =>
                    prisma.idempotencyRequest.findUnique({
                        where: { keyHash },
                        select: attemptSelect,
                    }),
                scope,
            );
        // A successful retry must not consume another address quota or send mail.
        // This lookup can only see this attempt's HMAC under the public RLS policy.
        const existingAttempt = await readAttempt();
        if (existingAttempt) return replayResponse(existingAttempt);

        const meta = await requestMeta();
        const normalizedEmail = input.email.toLowerCase();
        const limits = [
            // Limites globais e por endereço continuam efetivos mesmo sem IP
            // confiável e impedem spam ilimitado por cabeçalhos falsificados.
            consumeRateLimit({
                scope: 'contact-global',
                identifier: 'all',
                limit: 200,
                windowMs: 60 * 60 * 1000,
            }),
            consumeRateLimit({
                scope: 'contact-address',
                identifier: normalizedEmail,
                limit: 5,
                windowMs: 24 * 60 * 60 * 1000,
            }),
        ];

        if (meta.ip) {
            limits.push(
                consumeRateLimit({
                    scope: 'contact-source-short',
                    identifier: meta.ip,
                    limit: 5,
                    windowMs: 15 * 60 * 1000,
                }),
                consumeRateLimit({
                    scope: 'contact-source-daily',
                    identifier: meta.ip,
                    limit: 25,
                    windowMs: 24 * 60 * 60 * 1000,
                }),
            );
        }

        const limitResults = await Promise.all(limits);

        if (limitResults.some((result) => !result.allowed)) {
            return {
                ok: false,
                message:
                    'Recebemos muitas solicitações desta conexão. Aguarde alguns minutos antes de tentar novamente.',
                data: { values: echoedValues },
            };
        }

        let outcome;
        try {
            outcome = await withPublicContactDatabaseScope(
                () =>
                    prisma.$transaction(
                        async (tx) => {
                            const existing = await tx.idempotencyRequest.findUnique({
                                where: { keyHash },
                                select: attemptSelect,
                            });
                            if (existing) return { kind: 'replay' as const, existing };
                            await tx.idempotencyRequest.create({
                                data: {
                                    keyHash,
                                    payloadHash,
                                    expiresAt: new Date(Date.now() + CONTACT_ATTEMPT_TTL_MS),
                                },
                                select: { keyHash: true },
                            });
                            const saved = await tx.contactMessage.create({
                                data: {
                                    name: encryptSensitive(input.name)!,
                                    email: encryptSensitive(normalizedEmail)!,
                                    phone: encryptSensitive(input.phone),
                                    city: encryptSensitive(input.city),
                                    subject: input.subject,
                                    language: input.language,
                                    message: encryptSensitive(input.message)!,
                                    // O controle de abuso usa somente chaves HMAC no RateLimitBucket;
                                    // IP e navegador não precisam ficar ligados à mensagem.
                                    ip: null,
                                    userAgent: null,
                                    encryptedAt: new Date(),
                                },
                                select: { id: true },
                            });
                            await tx.auditLog.create({
                                data: {
                                    action: 'Mensagem recebida pelo Fale Conosco',
                                    actorLabel: 'site público',
                                    target: `Mensagem ${saved.id}`,
                                    userId: null,
                                    ip: null,
                                    userAgent: null,
                                    metadata: { contactMessageId: saved.id },
                                },
                                select: { id: true },
                            });
                            // Durable delivery intents share the message/claim/audit commit.
                            // SMTP is performed only by the bounded operational worker.
                            await tx.contactEmailJob.createMany({
                                data: [
                                    { contactMessageId: saved.id, kind: 'NOTIFICATION' },
                                    { contactMessageId: saved.id, kind: 'ACKNOWLEDGEMENT' },
                                ],
                            });
                            return { kind: 'created' as const };
                        },
                        { maxWait: 5_000, timeout: 10_000 },
                    ),
                scope,
            );
        } catch (error) {
            if (!isIdempotencyClaimConflict(error)) throw error;
            // The losing unique INSERT rolled its entire transaction back. Once
            // the winner commits, only that attempt's fingerprint is readable.
            const committed = await readAttempt();
            if (!committed) throw error;
            return replayResponse(committed);
        }
        if (outcome.kind === 'replay') return replayResponse(outcome.existing);

        revalidatePath('/admin/mensagens');
        revalidatePath('/admin');

        return { ok: true, message: SUCCESS_MESSAGE };
    } catch (error) {
        if (error instanceof UntrustedOriginError) return { ok: false, message: error.message };
        logError('contact.create_failed', error);
        return {
            ok: false,
            message:
                'Não conseguimos registrar sua mensagem agora. Tente novamente em alguns minutos ou escreva para contato@spmnacional.org.br.',
            data: { values: echoedValues },
        };
    }
}
