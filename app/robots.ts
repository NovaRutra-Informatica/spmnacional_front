import type { MetadataRoute } from 'next';
import { env } from '@/lib/server/env';

// Depende de APP_URL, que só é conhecida em execução — não no `docker build`.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
    const base = env.appUrl.replace(/\/$/, '');

    return {
        rules: {
            userAgent: '*',
            allow: '/',
            // Painel, área do atendente, rotas de serviço e links de convite não
            // têm o que indexar — e o convite ainda carrega token na URL.
            //
            // `/api` não é bloqueado por inteiro de propósito: com
            // STORAGE_DRIVER=local, capas de notícia, PDFs de editais e
            // documentos são servidos por /api/arquivos, e bloquear esse
            // prefixo tiraria todos eles do índice.
            disallow: ['/admin', '/atendente', '/convite', '/api/auth', '/api/cron', '/api/health'],
        },
        sitemap: `${base}/sitemap.xml`,
        host: base,
    };
}
