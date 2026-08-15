import type { MetadataRoute } from 'next';
import { env } from '@/lib/server/env';
import { listPublishedPostSlugs, listSemanaAnos } from '@/lib/server/queries';

// Lê notícias e edições da Semana do Postgres a cada requisição.
export const dynamic = 'force-dynamic';

type ChangeFrequency = MetadataRoute.Sitemap[number]['changeFrequency'];

interface StaticRoute {
    path: string;
    priority: number;
    changeFrequency: ChangeFrequency;
}

const STATIC_ROUTES: StaticRoute[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/quem-somos', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/quem-somos/historia', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/quem-somos/estrutura', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/quem-somos/documentos', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/o-que-fazemos', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/onde-estamos', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/agenda', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/semana-do-migrante', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/publicacoes', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/publicacoes/blog', priority: 0.9, changeFrequency: 'daily' },
    { path: '/publicacoes/editais', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/publicacoes/testemunhos', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/legislacao', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/legislacao/lei-de-migracao', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/legislacao/decreto-57533', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/legislacao/lei-municipal-16478', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/transparencia', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/como-ajudar', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/fale-conosco', priority: 0.8, changeFrequency: 'yearly' },
    { path: '/politica-de-privacidade', priority: 0.3, changeFrequency: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = env.appUrl.replace(/\/$/, '');
    const now = new Date();

    // Um banco fora do ar não pode derrubar o sitemap inteiro: as rotas fixas
    // continuam sendo publicadas.
    const [posts, anos] = await Promise.all([
        listPublishedPostSlugs().catch(() => []),
        listSemanaAnos().catch(() => []),
    ]);

    const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
        url: `${base}${route.path}`,
        lastModified: now,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
    }));

    // A URL canônica é `/semana-do-migrante/<ano>`: o formato antigo
    // (`material-<ano>`) só existe como redirecionamento em next.config.ts.
    for (const ano of anos) {
        entries.push({
            url: `${base}/semana-do-migrante/${ano}`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.6,
        });
    }

    for (const post of posts) {
        entries.push({
            url: `${base}/publicacoes/blog/${post.slug}`,
            lastModified: post.updatedAt,
            changeFrequency: 'monthly',
            priority: 0.7,
        });
    }

    // Rede de segurança contra duplicatas: uma mesma URL listada duas vezes faz
    // o Search Console reclamar do sitemap inteiro.
    const vistas = new Set<string>();
    return entries.filter((entry) => {
        if (vistas.has(entry.url)) return false;
        vistas.add(entry.url);
        return true;
    });
}
