import { readLocalFile } from '@/lib/server/storage';

/**
 * Entrega os uploads quando `STORAGE_DRIVER=local`.
 *
 * Com o driver `gcs` os arquivos são servidos pelo próprio bucket e
 * `readLocalFile` devolve null — a rota responde 404 e ninguém depende dela.
 * A defesa contra travessia de diretório fica em `lib/server/storage.ts`, que
 * recusa qualquer chave que escape da pasta configurada.
 */
export const dynamic = 'force-dynamic';

interface RouteContext {
    params: Promise<{ key: string[] }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const { key } = await context.params;
    const storageKey = key.join('/');

    const file = await readLocalFile(storageKey);

    if (!file) {
        return new Response('Arquivo não encontrado.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    return new Response(new Uint8Array(file.data), {
        headers: {
            'Content-Type': file.mimeType,
            'Content-Length': String(file.data.length),
            // A chave carrega um sufixo aleatório, então o conteúdo nunca muda:
            // pode ficar em cache para sempre.
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            // SVG enviado pela mídia é servido na mesma origem do painel; sem
            // isto, um arquivo com <script> dentro executaria como se fosse
            // código nosso quando aberto direto. O sandbox não atrapalha o uso
            // normal em <img>, que ignora a CSP da própria imagem.
            'Content-Security-Policy': "default-src 'none'; sandbox",
        },
    });
}
