import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import Animate from '@/components/Animate';
import AnimateLink from '@/components/AnimateLink';
import PageCta from '@/components/PageCta';
import PageHero from '@/components/PageHero';
import { formatDateLong } from '@/lib/labels';
import { excerptFromMarkdown, readingMinutes, renderMarkdown } from '@/lib/markdown';
import { env } from '@/lib/server/env';
import { getPostBySlug, incrementPostViews, listPublishedPosts } from '@/lib/server/queries';

/** A imagem do build roda sem banco: sem isto o prerender quebraria. */
export const dynamic = 'force-dynamic';

/** Mesma capa de reserva usada na listagem, para não quebrar o og:image. */
const FALLBACK_COVER = '/assets/exemplo-migrantes.jpeg';

interface ArtigoPageProps {
    /** No Next 16 os parâmetros de rota chegam como Promise. */
    params: Promise<{ slug: string }>;
}

/** `generateMetadata` e o corpo da página pedem o mesmo artigo: uma consulta por requisição. */
const carregarPost = cache(getPostBySlug);

/** APP_URL pode vir com barra no fim; a URL canônica não pode ter barra dobrada. */
const BASE_URL = env.appUrl.replace(/\/+$/, '');

/** O og:image precisa de URL absoluta; a capa pode vir relativa ou do GCS. */
function absoluteUrl(path: string): string {
    return /^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`;
}

export async function generateMetadata({ params }: ArtigoPageProps): Promise<Metadata> {
    const { slug } = await params;
    const post = await carregarPost(slug);

    if (!post) {
        return { title: 'Publicação não encontrada' };
    }

    const description = post.excerpt || excerptFromMarkdown(post.content);
    const cover = absoluteUrl(post.coverUrl ?? FALLBACK_COVER);

    return {
        title: post.title,
        description,
        openGraph: {
            type: 'article',
            title: post.title,
            description,
            url: `${BASE_URL}/publicacoes/blog/${post.slug}`,
            images: [cover],
            publishedTime: post.publishedAt?.toISOString(),
        },
    };
}

export default async function ArtigoPage({ params }: ArtigoPageProps) {
    const { slug } = await params;
    const post = await carregarPost(slug);

    if (!post) {
        notFound();
    }

    // Só notícias publicadas chegam aqui, então a contagem reflete leitura real.
    await incrementPostViews(post.id);

    // Uma a mais para poder descartar a própria notícia e ainda sobrarem quatro.
    const outras = (await listPublishedPosts({ take: 5 }))
        .filter((outra) => outra.slug !== post.slug)
        .slice(0, 4);

    const tags = post.tags.map((relation) => relation.tag);
    const publicada = formatDateLong(post.publishedAt);
    const url = `${BASE_URL}/publicacoes/blog/${post.slug}`;
    const chamada = encodeURIComponent(`${post.title} — ${url}`);
    const share = {
        whatsapp: `https://wa.me/?text=${chamada}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        x: `https://twitter.com/intent/tweet?text=${chamada}`,
    };

    return (
        <>
            <PageHero
                eyebrow={`${post.category.name} · ${publicada}`}
                title={post.title}
                subtitle={post.excerpt}
                crumbs={[
                    { label: 'Publicações', link: '/publicacoes' },
                    { label: 'Blog', link: '/publicacoes/blog' },
                    { label: post.title },
                ]}
            />

            <section className="section">
                <div className="container with-aside">
                    <Animate as="article" className="prose prose--wide">
                        <div className="law-meta">
                            <div>
                                <span>Categoria</span>
                                <strong>{post.category.name}</strong>
                            </div>
                            <div>
                                <span>Publicado em</span>
                                <strong>{publicada}</strong>
                            </div>
                            <div>
                                <span>Autoria</span>
                                <strong>{post.authorName}</strong>
                            </div>
                            <div>
                                <span>Tempo de leitura</span>
                                <strong>{readingMinutes(post.content)} min</strong>
                            </div>
                        </div>

                        {/* renderMarkdown escapa o HTML na entrada — a saída é segura. */}
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />

                        {tags.length > 0 && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '0.5rem',
                                    marginTop: '2.5rem',
                                }}
                            >
                                {tags.map((tag) => (
                                    <span className="badge-pill" key={tag.slug}>
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        )}

                        <hr
                            style={{
                                margin: '3rem 0',
                                border: 'none',
                                borderTop: '1px solid #eee',
                            }}
                        />

                        <p style={{ fontSize: '0.9rem', color: '#767676' }}>
                            <strong>Serviço Pastoral dos Migrantes</strong> — texto publicado por{' '}
                            {post.authorName}. Reprodução livre para fins pastorais e educativos,
                            com indicação da fonte.
                        </p>
                    </Animate>

                    <aside className="aside-sticky">
                        {outras.length > 0 && (
                            <div className="aside-box">
                                <h4>Leia também</h4>
                                <ul>
                                    {outras.map((outra) => (
                                        <li key={outra.slug}>
                                            <Link href={`/publicacoes/blog/${outra.slug}`}>
                                                {outra.title} →
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="aside-box">
                            <h4>Compartilhe</h4>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <a
                                    className="btn btn--outline btn--sm"
                                    href={share.whatsapp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Compartilhar no WhatsApp"
                                >
                                    <i className="fab fa-whatsapp"></i>
                                </a>
                                <a
                                    className="btn btn--outline btn--sm"
                                    href={share.facebook}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Compartilhar no Facebook"
                                >
                                    <i className="fab fa-facebook-f"></i>
                                </a>
                                <a
                                    className="btn btn--outline btn--sm"
                                    href={share.x}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Compartilhar no X"
                                >
                                    <i className="fab fa-x-twitter"></i>
                                </a>
                            </div>
                        </div>
                    </aside>
                </div>
            </section>

            <section className="section section--light">
                <div className="container">
                    <Animate className="section-head section-head--center">
                        <span className="eyebrow">Continue lendo</span>
                        <h2>Outras publicações</h2>
                    </Animate>

                    <div className="grid grid--3">
                        <AnimateLink className="card" href="/publicacoes/blog">
                            <div className="card__icon">
                                <i className="fas fa-newspaper"></i>
                            </div>
                            <h3>Voltar ao blog</h3>
                            <p>Todos os artigos, notas e relatos publicados pela rede do SPM.</p>
                            <span className="card__link">
                                Ver tudo <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>
                        <AnimateLink className="card delay-100" href="/publicacoes/testemunhos">
                            <div className="card__icon">
                                <i className="fas fa-comment-dots"></i>
                            </div>
                            <h3>Testemunhos</h3>
                            <p>As histórias que sustentam cada análise que publicamos.</p>
                            <span className="card__link">
                                Ler histórias <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>
                        <AnimateLink className="card delay-200" href="/publicacoes/editais">
                            <div className="card__icon">
                                <i className="fas fa-bullhorn"></i>
                            </div>
                            <h3>Editais abertos</h3>
                            <p>Chamadas públicas e oportunidades para a rede e para migrantes.</p>
                            <span className="card__link">
                                Ver editais <i className="fas fa-arrow-right"></i>
                            </span>
                        </AnimateLink>
                    </div>
                </div>
            </section>

            <PageCta />
        </>
    );
}
