import { getCurrentUser } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { readStoredFile } from '@/lib/server/storage';

/**
 * Entrega arquivos locais ou do bucket privado. Conteúdo ainda não publicado
 * só pode ser lido dentro de uma sessão administrativa; o público não consegue
 * enumerar rascunhos da biblioteca.
 */
export const dynamic = 'force-dynamic';

interface RouteContext {
    params: Promise<{ key: string[] }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const { key } = await context.params;
    const storageKey = key.join('/');
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
        return new Response('Arquivo não encontrado.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    const isPublic = Boolean(
        media.posts.length ||
        media.editais.length ||
        media.documentos.length ||
        media.materiais.length,
    );

    if (!isPublic && !(await getCurrentUser())) {
        return new Response('Arquivo não encontrado.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    const file = await readStoredFile(storageKey);

    if (!file) {
        return new Response('Arquivo não encontrado.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    const filename = media.originalName.replace(/["\r\n]/g, '_');
    const canRenderInline =
        media.mimeType.startsWith('image/') || media.mimeType === 'application/pdf';

    return new Response(file.body as BodyInit, {
        headers: {
            'Content-Type': media.mimeType,
            ...(file.contentLength ? { 'Content-Length': file.contentLength } : {}),
            'Content-Disposition': `${canRenderInline ? 'inline' : 'attachment'}; filename="${filename}"`,
            'Cache-Control': isPublic
                ? 'public, max-age=31536000, immutable'
                : 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
        },
    });
}
