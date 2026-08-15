import { env } from '@/lib/server/env';
import { listPublishedPosts } from '@/lib/server/queries';

// Lê as notícias publicadas do Postgres a cada requisição.
export const dynamic = 'force-dynamic';

const FEED_SIZE = 20;

const CHANNEL_TITLE = 'SPM — Serviço Pastoral dos Migrantes';
const CHANNEL_DESCRIPTION =
    'Notícias, editais e materiais de formação do Serviço Pastoral dos Migrantes.';

/** Escapa o que vai dentro de um nó de texto do XML. */
function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export async function GET(): Promise<Response> {
    const base = env.appUrl.replace(/\/$/, '');
    const posts = await listPublishedPosts({ take: FEED_SIZE });

    const items = posts
        .map((post) => {
            const url = `${base}/publicacoes/blog/${post.slug}`;
            const published = post.publishedAt ?? new Date();

            return [
                '        <item>',
                `            <title>${escapeXml(post.title)}</title>`,
                `            <link>${escapeXml(url)}</link>`,
                `            <guid isPermaLink="true">${escapeXml(url)}</guid>`,
                `            <pubDate>${published.toUTCString()}</pubDate>`,
                `            <description>${escapeXml(post.excerpt)}</description>`,
                `            <category>${escapeXml(post.category.name)}</category>`,
                // `<author>` do RSS 2.0 exige endereço de e-mail; a assinatura
                // aqui é o nome de uma pessoa ou de uma equipe, então vai em
                // `dc:creator`, que é o campo certo e o que os leitores exibem.
                `            <dc:creator>${escapeXml(post.authorName)}</dc:creator>`,
                '        </item>',
            ].join('\n');
        })
        .join('\n');

    // A data do canal acompanha a notícia mais recente para que os leitores
    // saibam, sem baixar tudo, que nada mudou.
    const lastBuild = posts[0]?.publishedAt ?? new Date();

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
        '    <channel>',
        `        <title>${escapeXml(CHANNEL_TITLE)}</title>`,
        `        <link>${escapeXml(base)}</link>`,
        `        <description>${escapeXml(CHANNEL_DESCRIPTION)}</description>`,
        '        <language>pt-br</language>',
        `        <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>`,
        `        <atom:link href="${escapeXml(`${base}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
        items,
        '    </channel>',
        '</rss>',
    ]
        .filter((line) => line !== '')
        .join('\n');

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=600, s-maxage=600',
        },
    });
}
