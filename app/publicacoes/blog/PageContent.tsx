'use client';
import { TranslatedContent } from '@/components/TranslationProvider';

import Link from '@/components/LocalizedLink';
import Animate from '@/components/Animate';
import PageCta from '@/components/PageCta';
import PageHero from '@/components/PageHero';

/** Recorte serializável de uma notícia publicada — montado no servidor. */
export interface BlogPostCard {
    slug: string;
    title: string;
    excerpt: string;
    /** Já formatada com `formatDateLong` no servidor. */
    date: string;
    category: string;
    cover: string;
}

interface PageContentProps {
    featured: BlogPostCard | null;
    posts: BlogPostCard[];
    categories: { name: string; slug: string }[];
    activeCategory?: string;
    page: number;
    pages: number;
}

const ALL_CATEGORIES = 'Todas';

export default function PageContent({
    featured,
    posts,
    categories,
    activeCategory,
    page,
    pages,
}: PageContentProps) {
    const filtered = posts;
    const pageHref = (number: number) =>
        `/publicacoes/blog?page=${number}${activeCategory ? `&category=${encodeURIComponent(activeCategory)}` : ''}`;

    return (
        <TranslatedContent>
            {
                <>
                    <PageHero
                        eyebrow="Blog e notícias"
                        title="O que estamos pensando e fazendo"
                        subtitle="Análises, notas públicas, relatos das equipes regionais e reflexões sobre a mobilidade humana no Brasil de hoje."
                        crumbs={[{ label: 'Publicações', link: '/publicacoes' }, { label: 'Blog' }]}
                        waveFill="#f8f9fa"
                    />

                    <section className="section section--light">
                        <div className="container">
                            {featured && (
                                <Animate as="article" className="post-feature">
                                    <div className="post-feature__img">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={featured.cover}
                                            alt={`Capa da publicação: ${featured.title}`}
                                            loading="lazy"
                                            decoding="async"
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                            }}
                                        />
                                    </div>
                                    <div className="post-feature__body">
                                        <span className="badge-pill badge-pill--accent">
                                            Em destaque · {featured.category}
                                        </span>
                                        <h2 dir="auto">{featured.title}</h2>
                                        <p className="post-card__date">{featured.date}</p>
                                        <p dir="auto">{featured.excerpt}</p>
                                        <Link
                                            className="btn btn--cta"
                                            href={`/publicacoes/blog/${featured.slug}`}
                                        >
                                            Ler o artigo completo{' '}
                                            <i className="fas fa-arrow-right"></i>
                                        </Link>
                                    </div>
                                </Animate>
                            )}

                            <Animate as="ul" className="pill-nav">
                                {[{ name: ALL_CATEGORIES, slug: '' }, ...categories].map(
                                    (category) => (
                                        <li key={category.slug}>
                                            <Link
                                                href={
                                                    category.slug
                                                        ? `/publicacoes/blog?category=${encodeURIComponent(category.slug)}`
                                                        : '/publicacoes/blog'
                                                }
                                                className={
                                                    (activeCategory ?? '') === category.slug
                                                        ? 'is-active'
                                                        : undefined
                                                }
                                                aria-current={
                                                    (activeCategory ?? '') === category.slug
                                                        ? 'page'
                                                        : undefined
                                                }
                                            >
                                                {category.name}
                                            </Link>
                                        </li>
                                    ),
                                )}
                            </Animate>

                            <div className="post-grid">
                                {filtered.map((post) => (
                                    <Animate as="article" className="post-card" key={post.slug}>
                                        <div className="post-card__img">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={post.cover}
                                                alt={`Capa da publicação: ${post.title}`}
                                                loading="lazy"
                                                decoding="async"
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover',
                                                }}
                                            />
                                            <span className="post-card__tag">{post.category}</span>
                                        </div>
                                        <div className="post-card__body">
                                            <span className="post-card__date">{post.date}</span>
                                            <h3 dir="auto">{post.title}</h3>
                                            <p dir="auto">{post.excerpt}</p>
                                            <Link
                                                className="post-card__link"
                                                href={`/publicacoes/blog/${post.slug}`}
                                            >
                                                Ler mais <i className="fas fa-arrow-right"></i>
                                            </Link>
                                        </div>
                                    </Animate>
                                ))}
                            </div>

                            {pages > 1 && (
                                <nav className="public-pagination" aria-label="Páginas do blog">
                                    {page > 1 && (
                                        <Link
                                            className="btn btn--outline"
                                            href={pageHref(page - 1)}
                                        >
                                            Anterior
                                        </Link>
                                    )}
                                    <span>
                                        {page} / {pages}
                                    </span>
                                    {page < pages && (
                                        <Link
                                            className="btn btn--outline"
                                            href={pageHref(page + 1)}
                                        >
                                            Próxima
                                        </Link>
                                    )}
                                </nav>
                            )}
                            {!filtered.length && (
                                <div className="empty-state">
                                    <i className="fas fa-newspaper"></i>
                                    {/* Blog vazio não é o mesmo que filtro sem resultado. */}
                                    {posts.length || featured ? (
                                        <>
                                            <h3>Nenhuma publicação nesta categoria</h3>
                                            <p>
                                                Experimente outra categoria ou volte a “Todas” para
                                                ver tudo o que publicamos.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <h3>Ainda não há publicações</h3>
                                            <p>
                                                Estamos preparando os primeiros textos. Volte em
                                                breve ou acompanhe as novidades pelo nosso boletim.
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    <PageCta
                        title="Receba nossas publicações por e-mail"
                        text="Um boletim por mês, sem excesso: os artigos mais importantes, os editais abertos e os materiais novos de formação."
                        primaryLabel="Assinar boletim"
                        primaryLink="/fale-conosco"
                        secondaryLabel="Ver editais"
                        secondaryLink="/publicacoes/editais"
                    />
                </>
            }
        </TranslatedContent>
    );
}
