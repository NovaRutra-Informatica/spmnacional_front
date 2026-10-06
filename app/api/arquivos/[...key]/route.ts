import { getCurrentUser, hasPermission } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { isValidStorageKey, readStoredFile } from '@/lib/server/storage';
import { logError } from '@/lib/server/logger';

/**
 * Entrega arquivos locais ou do bucket privado. Conteúdo ainda não publicado
 * só pode ser lido dentro de uma sessão administrativa; o público não consegue
 * enumerar rascunhos da biblioteca.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
    params: Promise<{ key: string[] }>;
}

function notFound(): Response {
    return new Response('Arquivo não encontrado.', {
        status: 404,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

function contentDisposition(name: string, inline: boolean): string {
    const clean = name.replace(/[\\/"\u0000-\u001f\u007f]/g, '_').slice(0, 240);
    const fallback = clean.replace(/[^\x20-\x7e]/g, '_') || 'arquivo';
    const encoded = encodeURIComponent(clean || 'arquivo').replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const { key } = await context.params;
    const storageKey = key.join('/');
    if (!isValidStorageKey(storageKey)) return notFound();
    const now = new Date();

    const media = await prisma.media.findUnique({
        where: { storageKey },
        select: {
            mimeType: true,
            originalName: true,
            posts: {
                where: { status: 'PUBLICADO', publishedAt: { lte: now } },
                select: { id: true },
                take: 1,
            },
            editais: {
                where: { published: true, publishedAt: { lte: now } },
                select: { id: true },
                take: 1,
            },
            documentos: {
                where: { published: true, publishedAt: { lte: now } },
                select: { id: true },
                take: 1,
            },
            materiais: {
                where: { edicao: { published: true } },
                select: { id: true },
                take: 1,
            },
        },
    });

    if (!media) {
        return notFound();
    }

    const isPublic = Boolean(
        media.posts.length ||
        media.editais.length ||
        media.documentos.length ||
        media.materiais.length,
    );

    if (!isPublic) {
        const user = await getCurrentUser();
        const canReadDraft =
            user &&
            (hasPermission(user, 'midia') ||
                (storageKey.startsWith('noticias/') && hasPermission(user, 'noticias')));
        if (!canReadDraft) return notFound();
    }

    let file;
    try {
        file = await readStoredFile(storageKey);
    } catch (error) {
        logError('storage.read_failed', error);
        return new Response('Arquivo temporariamente indisponível.', {
            status: 503,
            headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '30' },
        });
    }

    if (!file) {
        return notFound();
    }

    const canRenderInline = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
    ].includes(media.mimeType);

    return new Response(file.body as BodyInit, {
        headers: {
            'Content-Type': media.mimeType,
            ...(file.contentLength ? { 'Content-Length': file.contentLength } : {}),
            'Content-Disposition': contentDisposition(media.originalName, canRenderInline),
            // Uma notícia pode ser despublicada após o download. A autorização
            // deve ser reavaliada em cada acesso, inclusive em caches/proxies.
            'Cache-Control': 'private, no-store, max-age=0',
            Vary: 'Cookie',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'Referrer-Policy': 'no-referrer',
        },
    });
}
