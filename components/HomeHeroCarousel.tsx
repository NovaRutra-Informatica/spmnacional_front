'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { FocusEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

const SLIDES = [
    {
        image: '/assets/home/acolhimento-comunitario.webp',
        alt: 'Mulheres de diferentes origens se abraçam durante um encontro comunitário.',
        eyebrow: 'Acolhida que gera pertencimento',
        title: 'Acolher é abrir caminhos para um novo começo.',
        description:
            'O SPM caminha com pessoas migrantes, fortalece vínculos e transforma a chegada em possibilidade.',
        primary: { label: 'Conheça nossa atuação', href: '/o-que-fazemos' },
        secondary: { label: 'Como ajudar', href: '/como-ajudar' },
        credit: 'Pavel Danilyuk / Pexels',
        creditUrl: 'https://www.pexels.com/photo/women-hugging-each-other-8815246/',
        position: 'center 48%',
    },
    {
        image: '/assets/home/familia-em-jornada.webp',
        alt: 'Família caminha por uma rua urbana levando bagagens.',
        eyebrow: 'Mobilidade humana e dignidade',
        title: 'Cada jornada carrega histórias, direitos e esperança.',
        description:
            'Há quatro décadas, o SPM atua para proteger direitos e apoiar recomeços em diferentes regiões do Brasil.',
        primary: { label: 'Conheça nossa história', href: '/quem-somos/historia' },
        secondary: { label: 'Encontre uma regional', href: '/onde-estamos' },
        credit: 'Markus Winkler / Pexels',
        creditUrl: 'https://www.pexels.com/photo/a-family-walking-in-the-street-4980098/',
        position: 'center 56%',
    },
    {
        image: '/assets/home/rede-diversa-sao-paulo.webp',
        alt: 'Grupo diverso reunido ao ar livre em São Paulo.',
        eyebrow: 'Uma rede que atravessa fronteiras',
        title: 'Juntos, construímos pontes entre povos e territórios.',
        description:
            'Formação, incidência e articulação conectam comunidades, organizações e equipes comprometidas com quem migra.',
        primary: { label: 'Veja onde estamos', href: '/onde-estamos' },
        secondary: { label: 'Leia as notícias', href: '/publicacoes/blog' },
        credit: 'Matheus Bertelli / Pexels',
        creditUrl:
            'https://www.pexels.com/photo/diverse-group-of-people-gathering-together-3797402/',
        position: 'center 42%',
    },
] as const;

const AUTOPLAY_MS = 7500;

export default function HomeHeroCarousel() {
    const [active, setActive] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [interactionPaused, setInteractionPaused] = useState(false);
    const [pageVisible, setPageVisible] = useState(true);
    const [reducedMotion, setReducedMotion] = useState(false);
    const rootRef = useRef<HTMLElement>(null);

    const goTo = useCallback((index: number) => {
        setActive((index + SLIDES.length) % SLIDES.length);
    }, []);

    const previous = useCallback(
        () => setActive((index) => (index - 1 + SLIDES.length) % SLIDES.length),
        [],
    );
    const next = useCallback(() => setActive((index) => (index + 1) % SLIDES.length), []);

    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const syncPreference = () => setReducedMotion(media.matches);
        syncPreference();
        media.addEventListener('change', syncPreference);
        return () => media.removeEventListener('change', syncPreference);
    }, []);

    useEffect(() => {
        const onVisibilityChange = () => setPageVisible(document.visibilityState === 'visible');
        onVisibilityChange();
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    useEffect(() => {
        if (!playing || interactionPaused || !pageVisible || reducedMotion) return;
        const timer = window.setInterval(next, AUTOPLAY_MS);
        return () => window.clearInterval(timer);
    }, [interactionPaused, next, pageVisible, playing, reducedMotion]);

    const onBlur = (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setInteractionPaused(false);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            previous();
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            next();
        }
    };

    const current = SLIDES[active];

    return (
        <section
            className="hero-carousel"
            aria-label="Destaques do Serviço Pastoral dos Migrantes"
            aria-roledescription="carrossel"
            ref={rootRef}
            onMouseEnter={() => setInteractionPaused(true)}
            onMouseLeave={() => setInteractionPaused(false)}
            onFocusCapture={() => setInteractionPaused(true)}
            onBlurCapture={onBlur}
            onKeyDown={onKeyDown}
        >
            <div className="hero-carousel__slides">
                {SLIDES.map((slide, index) => {
                    const isActive = index === active;
                    return (
                        <article
                            className={`hero-slide${isActive ? ' is-active' : ''}`}
                            aria-hidden={!isActive}
                            key={slide.image}
                        >
                            <Image
                                className="hero-slide__image"
                                src={slide.image}
                                alt={isActive ? slide.alt : ''}
                                fill
                                priority={index === 0}
                                sizes="100vw"
                                style={{ objectPosition: slide.position }}
                            />
                            <div className="hero-slide__scrim" />
                            <div className="container hero-slide__inner">
                                <div className="hero-slide__content">
                                    <span className="hero-slide__eyebrow">{slide.eyebrow}</span>
                                    <h1>{slide.title}</h1>
                                    <p>{slide.description}</p>
                                    <div className="hero-slide__actions">
                                        <Link
                                            className="btn btn-cta"
                                            href={slide.primary.href}
                                            tabIndex={isActive ? undefined : -1}
                                        >
                                            {slide.primary.label}
                                            <i className="fas fa-arrow-right" aria-hidden="true" />
                                        </Link>
                                        <Link
                                            className="btn btn-hero-secondary"
                                            href={slide.secondary.href}
                                            tabIndex={isActive ? undefined : -1}
                                        >
                                            {slide.secondary.label}
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            <div className="hero-carousel__footer container">
                <div className="hero-carousel__controls" aria-label="Controles do carrossel">
                    <button type="button" onClick={previous} aria-label="Destaque anterior">
                        <i className="fas fa-arrow-left" aria-hidden="true" />
                    </button>
                    <div
                        className="hero-carousel__dots"
                        role="group"
                        aria-label="Escolher destaque"
                    >
                        {SLIDES.map((slide, index) => (
                            <button
                                type="button"
                                className={index === active ? 'is-active' : ''}
                                aria-label={`Mostrar destaque ${index + 1}: ${slide.title}`}
                                aria-current={index === active ? 'true' : undefined}
                                onClick={() => goTo(index)}
                                key={slide.image}
                            />
                        ))}
                    </div>
                    <button type="button" onClick={next} aria-label="Próximo destaque">
                        <i className="fas fa-arrow-right" aria-hidden="true" />
                    </button>
                    {!reducedMotion && (
                        <button
                            type="button"
                            onClick={() => setPlaying((value) => !value)}
                            aria-label={
                                playing ? 'Pausar rotação automática' : 'Reproduzir carrossel'
                            }
                        >
                            <i
                                className={`fas ${playing ? 'fa-pause' : 'fa-play'}`}
                                aria-hidden="true"
                            />
                        </button>
                    )}
                </div>
                <a
                    className="hero-carousel__credit"
                    href={current.creditUrl}
                    target="_blank"
                    rel="noreferrer"
                    tabIndex={0}
                >
                    Foto: {current.credit}
                </a>
            </div>

            <p className="sr-only" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
                Destaque {active + 1} de {SLIDES.length}: {current.title}
            </p>
        </section>
    );
}
