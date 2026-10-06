import { Buffer } from 'node:buffer';
import type { MediaKind } from '@/lib/generated/prisma/enums';
import { getCurrentUser, hasPermission } from '@/lib/server/auth';
import { recordAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { ActionInputError } from '@/lib/server/actions';
import { MAX_UPLOAD_BYTES, storeBuffer } from '@/lib/server/storage';
import { isTrustedMutationOrigin } from '@/lib/server/request-origin';
import { logError } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PURPOSES = {
    biblioteca: { permission: 'midia', prefix: 'biblioteca' },
    noticias: { permission: 'noticias', prefix: 'noticias' },
} as const;

type Purpose = keyof typeof PURPOSES;

function json(body: Record<string, unknown>, status: number): Response {
    return Response.json(body, {
        status,
        headers: {
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

function sameOrigin(request: Request): boolean {
    return isTrustedMutationOrigin(
        request.headers,
        env.appUrl,
        process.env.NODE_ENV !== 'production',
    );
}

function filenameFrom(request: Request): string | null {
    const encoded = request.headers.get('x-file-name');
    if (!encoded || encoded.length > 900) return null;

    try {
        const filename = decodeURIComponent(encoded).trim();
        if (!filename || filename.length > 240 || /[\\/\u0000-\u001f\u007f]/.test(filename)) {
            return null;
        }
        return filename;
    } catch {
        return null;
    }
}

async function readLimitedBody(request: Request): Promise<Buffer> {
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
        throw new ActionInputError('Arquivo maior que o limite de 10 MB.');
    }

    if (!request.body) throw new ActionInputError('O arquivo está vazio.');

    const reader = request.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
            reject(new ActionInputError('O envio demorou demais. Tente novamente.'));
            void reader.cancel('tempo excedido').catch(() => undefined);
        }, 30_000);
    });

    try {
        while (true) {
            const { done, value } = await Promise.race([reader.read(), deadline]);
            if (done) break;
            total += value.byteLength;
            if (total > MAX_UPLOAD_BYTES) {
                await reader.cancel('limite excedido');
                throw new ActionInputError('Arquivo maior que o limite de 10 MB.');
            }
            chunks.push(Buffer.from(value));
        }
    } finally {
        clearTimeout(timeout);
        reader.releaseLock();
    }

    if (!total) throw new ActionInputError('O arquivo está vazio.');
    return Buffer.concat(chunks, total);
}

function kindFromMime(mimeType: string): MediaKind {
    if (mimeType.startsWith('image/')) return 'IMAGEM';
    if (
        mimeType === 'application/pdf' ||
        mimeType === 'application/zip' ||
        mimeType === 'application/msword' ||
        mimeType.startsWith('application/vnd.')
    ) {
        return 'DOCUMENTO';
    }
    return 'OUTRO';
}

export async function POST(request: Request): Promise<Response> {
    if (!sameOrigin(request)) {
        return json({ ok: false, message: 'Origem da solicitação inválida.' }, 403);
    }

    const url = new URL(request.url);
    const purpose = url.searchParams.get('purpose') as Purpose | null;
    const policy = purpose && Object.hasOwn(PURPOSES, purpose) ? PURPOSES[purpose] : null;
    if (!policy) {
        return json({ ok: false, message: 'Finalidade de upload inválida.' }, 400);
    }

    const user = await getCurrentUser();
    if (!user) {
        return json({ ok: false, message: 'Sua sessão expirou. Entre novamente.' }, 401);
    }
    if (!hasPermission(user, policy.permission)) {
        await recordAudit({
            action: 'Tentativa de upload sem permissão',
            target: policy.permission,
            level: 'ALERTA',
            userId: user.id,
            actorLabel: user.email,
        });
        return json(
            { ok: false, message: 'Você não tem permissão para enviar este arquivo.' },
            403,
        );
    }

    const [shortLimit, dailyLimit] = await Promise.all([
        consumeRateLimit({
            scope: 'admin-upload-short',
            identifier: user.id,
            limit: 30,
            windowMs: 15 * 60 * 1000,
        }),
        consumeRateLimit({
            scope: 'admin-upload-daily',
            identifier: user.id,
            limit: 200,
            windowMs: 24 * 60 * 60 * 1000,
        }),
    ]);
    if (!shortLimit.allowed || !dailyLimit.allowed) {
        return json(
            { ok: false, message: 'Limite de envios atingido. Aguarde e tente novamente.' },
            429,
        );
    }

    const originalName = filenameFrom(request);
    if (!originalName) {
        return json({ ok: false, message: 'Nome de arquivo inválido.' }, 400);
    }
    if (purpose === 'noticias' && !/\.(?:jpe?g|png|webp)$/i.test(originalName)) {
        return json({ ok: false, message: 'A capa precisa ser JPG, PNG ou WebP.' }, 400);
    }

    try {
        const bytes = await readLimitedBody(request);
        let recoveryId: string | undefined;
        const stored = await storeBuffer(bytes, originalName, {
            prefix: policy.prefix,
            beforeStore: async (file) => {
                if (
                    purpose === 'noticias' &&
                    !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType)
                ) {
                    throw new ActionInputError('A capa precisa ser JPG, PNG ou WebP.');
                }
                // The intention exists BEFORE the GCS/local write. A process crash,
                // SQL outage or ambiguous provider timeout leaves a retryable job.
                // 15 minutes exceeds the bounded upload + commit deadlines.
                const recovery = await prisma.mediaDeletion.create({
                    data: {
                        storageKey: file.storageKey,
                        nextAttemptAt: new Date(Date.now() + 15 * 60_000),
                    },
                    select: { id: true },
                });
                recoveryId = recovery.id;
            },
        });
        if (!recoveryId) throw new Error('Upload recovery intention missing');
        const media = await prisma.$transaction(
            async (tx) => {
                const created = await tx.media.create({
                    data: {
                        filename: stored.filename,
                        originalName,
                        mimeType: stored.mimeType,
                        size: stored.size,
                        kind: kindFromMime(stored.mimeType),
                        url: stored.url,
                        storageKey: stored.storageKey,
                        uploadedById: user.id,
                    },
                    select: { id: true, url: true, originalName: true, mimeType: true, size: true },
                });
                const cleared = await tx.mediaDeletion.deleteMany({
                    where: {
                        id: recoveryId,
                        storageKey: stored.storageKey,
                        attempts: 0,
                        leaseToken: null,
                    },
                });
                if (cleared.count !== 1) throw new Error('Upload recovery intention changed');
                return created;
            },
            { maxWait: 5_000, timeout: 10_000 },
        );

        await recordAudit({
            action: 'Arquivo enviado para a biblioteca',
            target: originalName,
            userId: user.id,
            actorLabel: user.email,
            metadata: { tamanho: stored.size, tipo: stored.mimeType, finalidade: purpose },
        });

        return json({ ok: true, media }, 201);
    } catch (error) {
        // The durable job handles orphan cleanup; do not race a timed-out upload
        // with an immediate DELETE or lose its key when the database is unavailable.
        if (error instanceof ActionInputError) {
            return json({ ok: false, message: error.message }, 400);
        }
        logError('upload.failed', error);
        return json({ ok: false, message: 'Não foi possível enviar o arquivo.' }, 500);
    }
}
