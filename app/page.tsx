import type { Metadata } from 'next';
import Link from 'next/link';
import Animate from '@/components/Animate';
import CountUp from '@/components/CountUp';
import HomeHeroCarousel from '@/components/HomeHeroCarousel';
import NewsletterForm from '@/components/NewsletterForm';
import { getHomeStats, listPublishedPosts } from '@/lib/server/queries';

// A home passou a ler notícias e números do Postgres.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: { absolute: 'SPM — Serviço Pastoral dos Migrantes' },
};

/** Capa de reserva para notícias publicadas sem imagem. */
const FALLBACK_COVER = '/assets/exemplo-migrantes.jpeg';

const originalPartners = [
    { name: 'CNBB', img: '/assets/parceiros/cnbb.png' },
    { name: 'Cáritas', img: '/assets/parceiros/caritas.png' },
    { name: 'Misereor', img: '/assets/parceiros/misereor.png' },
    { name: 'Adveniat', img: '/assets/parceiros/adveniat.png' },
    { name: 'Rede Clamor', img: '/assets/parceiros/redeclamor.png' },
];

const partnersList = [...originalPartners, ...originalPartners];

export default async function HomePage() {
    const [posts, stats] = await Promise.all([listPublishedPosts({ take: 3 }), getHomeStats()]);

    return (
        <div className="home-page">
            <HomeHeroCarousel />

            <Animate as="section" className="pillars-section section-padding">
                <div className="container">
                    <div className="section-header text-center mb-5">
                        <h5 className="text-accent uppercase ls-1">Nossa Metodologia</h5>
                        <h2 className="mb-3">Como transformamos vidas</h2>
                        <p className="section-desc">
                            Atuamos em quatro frentes fundamentais para garantir a dignidade humana.
                        </p>
                    </div>

                    <div className="pillars-grid">
                        <div className="pillar-card">
                            <div className="icon-box">
                                <i className="fas fa-home"></i>
                            </div>
                            <h3>Acolher</h3>
                            <p>
                                Oferecemos abrigo seguro, alimentação e suporte inicial para quem
                                acaba de chegar.
                            </p>
                            <Link className="pillar-link" href="/o-que-fazemos">
                                Saiba mais <i className="fas fa-arrow-right"></i>
                            </Link>
                        </div>
                        <div className="pillar-card">
                            <div className="icon-box">
                                <i className="fas fa-shield-alt"></i>
                            </div>
                            <h3>Proteger</h3>
                            <p>Defesa jurídica e garantia de direitos contra o tráfico humano.</p>
                            <Link className="pillar-link" href="/legislacao">
                                Saiba mais <i className="fas fa-arrow-right"></i>
                            </Link>
                        </div>
                        <div className="pillar-card">
                            <div className="icon-box">
                                <i className="fas fa-seedling"></i>
                            </div>
                            <h3>Promover</h3>
                            <p>Cursos de capacitação e língua portuguesa para autonomia.</p>
                            <Link className="pillar-link" href="/o-que-fazemos">
                                Saiba mais <i className="fas fa-arrow-right"></i>
                            </Link>
                        </div>
                        <div className="pillar-card">
                            <div className="icon-box">
                                <i className="fas fa-hands-helping"></i>
                            </div>
                            <h3>Integrar</h3>
                            <p>Construção de pontes culturais e inserção na comunidade.</p>
                            <Link className="pillar-link" href="/onde-estamos">
                                Saiba mais <i className="fas fa-arrow-right"></i>
                            </Link>
                        </div>
                    </div>
                </div>
            </Animate>

            <section className="impact-section bg-light section-padding relative">
                <div className="container">
                    <div className="impact-stats grid-3">
                        <Animate className="stat-card shadow-sm">
                            <i className="fas fa-map-marker-alt stat-icon"></i>
                            <CountUp className="stat-number" end={stats.ufs} />
                            <span className="stat-label">UFs com unidade publicada</span>
                        </Animate>
                        <Animate className="stat-card shadow-sm delay-100">
                            <i className="fas fa-calendar-check stat-icon"></i>
                            <CountUp className="stat-number" end={stats.edicoes} />
                            <span className="stat-label">Edições da Semana do Migrante</span>
                        </Animate>
                        <Animate className="stat-card shadow-sm delay-200">
                            <i className="fas fa-newspaper stat-icon"></i>
                            <CountUp className="stat-number" end={stats.posts} />
                            <span className="stat-label">Publicações no blog</span>
                        </Animate>
                    </div>
                </div>
            </section>

            <Animate as="section" className="story-section">
                <div className="container grid-story">
                    <div className="story-content">
                        <span className="story-kicker">40 anos no caminho com os migrantes</span>
                        <i className="fas fa-quote-left quote-big" aria-hidden="true"></i>
                        <h2 className="story-title">
                            &quot;O migrante não é um problema. É uma ponte entre povos.&quot;
                        </h2>
                        <div className="story-author">
                            <div className="author-img">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/assets/padre-alfredinho.png" alt="Padre Alfredinho" />
                            </div>
                            <div className="author-info">
                                <strong>Padre Alfredinho</strong>
                                <span>Inspiração da caminhada do SPM</span>
                            </div>
                        </div>
                    </div>
                    <div className="story-cta">
                        <span className="story-number">40</span>
                        <h3>Uma história feita em rede</h3>
                        <p>
                            Desde 1985, formação, incidência e articulação aproximam pessoas,
                            comunidades e territórios.
                        </p>
                        <Link className="btn btn-outline-primary" href="/quem-somos/historia">
                            Conheça essa história <i className="fas fa-arrow-right"></i>
                        </Link>
                    </div>
                </div>
            </Animate>

            <Animate as="section" className="partners-section">
                <div className="container text-center mb-5">
                    <span className="badge-pill">Rede de Apoio</span>
                    <h3 className="section-title">Quem caminha conosco</h3>
                </div>

                <div className="scroller" data-direction="left" data-speed="slow">
                    <div
                        className="scroller__inner"
                        role="group"
                        tabIndex={0}
                        aria-label="Parceiros do SPM. A animação pausa enquanto este elemento está em foco."
                    >
                        {partnersList.map((partner, index) => (
                            <div
                                className="partner-card-minimal"
                                key={`${partner.name}-${index}`}
                                aria-hidden={index >= originalPartners.length}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={partner.img}
                                    alt={index < originalPartners.length ? partner.name : ''}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </Animate>

            <Animate as="section" className="latest-news section-padding bg-light relative">
                <div className="container">
                    <div className="section-header mb-5 text-center">
                        <h5 className="text-accent uppercase ls-1">Nosso Blog</h5>
                        <h2>Últimas Notícias e Histórias</h2>
                    </div>

                    {posts.length === 0 ? (
                        <div className="empty-state">
                            <i className="fas fa-newspaper"></i>
                            <h3>Ainda não há notícias publicadas</h3>
                            <p>
                                As histórias, reportagens e reflexões do SPM aparecem aqui assim que
                                forem publicadas. Acompanhe o{' '}
                                <Link href="/publicacoes/blog">blog</Link>.
                            </p>
                        </div>
                    ) : (
                        <div className="news-grid">
                            {posts.map((post) => (
                                <article
                                    className={
                                        post.highlight
                                            ? 'news-card-vertical shadow-md highlight-card'
                                            : 'news-card-vertical shadow-md'
                                    }
                                    key={post.id}
                                >
                                    <div
                                        className="news-img"
                                        style={{
                                            backgroundImage: `url(${post.coverUrl ?? FALLBACK_COVER})`,
                                        }}
                                    ></div>
                                    <div className="news-body">
                                        <span className="news-category">{post.category.name}</span>
                                        <h3 className="news-title">
                                            <Link href={`/publicacoes/blog/${post.slug}`}>
                                                {post.title}
                                            </Link>
                                        </h3>
                                        <p className="news-excerpt">{post.excerpt}</p>
                                        <Link
                                            href={`/publicacoes/blog/${post.slug}`}
                                            className="read-more-link"
                                        >
                                            Ler mais →
                                        </Link>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </Animate>

            <Animate as="section" className="newsletter-section">
                <div className="container">
                    <div className="newsletter-wrapper">
                        <div className="news-text">
                            <span className="newsletter-kicker">Boletim do SPM</span>
                            <h2>Histórias, direitos e mobilização no seu e-mail.</h2>
                            <p>
                                Receba uma seleção mensal de notícias, editais e materiais da nossa
                                rede.
                            </p>
                        </div>

                        <NewsletterForm />
                    </div>
                </div>
            </Animate>
        </div>
    );
}
