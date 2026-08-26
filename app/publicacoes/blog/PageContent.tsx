'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
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
    categories: string[];
}

const ALL_CATEGORIES = 'Todas';

export default function PageContent({ featured, posts, categories }: PageContentProps) {
    const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);

    const filtered = useMemo(
        () =>
            activeCategory === ALL_CATEGORIES
                ? posts
                : posts.filter((post) => post.category === activeCategory),
        [activeCategory, posts],
    );

    return (
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
                            <div
                                className="post-feature__img"
                                style={{ backgroundImage: `url(${featured.cover})` }}
                            ></div>
                            <div className="post-feature__body">
                                <span className="badge-pill badge-pill--accent">
                                    Em destaque · {featured.category}
                                </span>
                                <h2>{featured.title}</h2>
                                <p className="post-card__date">{featured.date}</p>
                                <p>{featured.excerpt}</p>
                                <Link
                                    className="btn btn--cta"
                                    href={`/publicacoes/blog/${featured.slug}`}
                                >
                                    Ler o artigo completo <i className="fas fa-arrow-right"></i>
                                </Link>
                            </div>
                        </Animate>
                    )}

                    <Animate as="ul" className="pill-nav">
                        {[ALL_CATEGORIES, ...categories].map((category) => (
                            <li key={category}>
                                <button
                                    type="button"
                                    className={
                                        activeCategory === category ? 'is-active' : undefined
                                    }
                                    onClick={() => setActiveCategory(category)}
                                >
                                    {category}
                                </button>
                            </li>
                        ))}
                    </Animate>

                    <div className="post-grid">
                        {filtered.map((post) => (
                            <Animate as="article" className="post-card" key={post.slug}>
                                <div
                                    className="post-card__img"
                                    style={{ backgroundImage: `url(${post.cover})` }}
                                >
                                    <span className="post-card__tag">{post.category}</span>
                                </div>
                                <div className="post-card__body">
                                    <span className="post-card__date">{post.date}</span>
                                    <h3>{post.title}</h3>
                                    <p>{post.excerpt}</p>
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

                    {!filtered.length && (
                        <div className="empty-state">
                            <i className="fas fa-newspaper"></i>
                            {/* Blog vazio não é o mesmo que filtro sem resultado. */}
                            {posts.length || featured ? (
                                <>
                                    <h3>Nenhuma publicação nesta categoria</h3>
                                    <p>
                                        Experimente outra categoria ou volte a “Todas” para ver tudo
                                        o que publicamos.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <h3>Ainda não há publicações</h3>
                                    <p>
                                        Estamos preparando os primeiros textos. Volte em breve ou
                                        acompanhe as novidades pelo nosso boletim.
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
    );
}
