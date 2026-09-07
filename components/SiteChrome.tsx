'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Elementos flutuantes do site público: voltar ao topo, barra fixa de
 * doação no celular e aviso de cookies.
 */
export default function SiteChrome() {
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [cookiesAccepted, setCookiesAccepted] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setCookiesAccepted(localStorage.getItem('spm_cookies') === 'true');

        const onScroll = () => setShowBackToTop(window.scrollY > 400);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const scrollToTop = () =>
        window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
        });

    const acceptCookies = () => {
        setCookiesAccepted(true);
        localStorage.setItem('spm_cookies', 'true');
    };

    return (
        <>
            <button
                className={`btn-back-to-top${showBackToTop ? ' show' : ''}`}
                onClick={scrollToTop}
                aria-label="Voltar ao topo"
                aria-hidden={!showBackToTop}
                tabIndex={showBackToTop ? 0 : -1}
            >
                <i className="fas fa-arrow-up" aria-hidden="true" />
            </button>

            <div className="mobile-sticky-bar">
                <div className="sticky-content">
                    <span className="sticky-text">Ajude a transformar vidas</span>
                    <Link href="/como-ajudar" className="btn-sticky-donate">
                        DOAR AGORA <i className="fas fa-heart pulse-icon" aria-hidden="true" />
                    </Link>
                </div>
            </div>

            {mounted && !cookiesAccepted && (
                <div className="cookie-banner">
                    <div className="cookie-content">
                        <p>
                            Este site guarda apenas preferências essenciais no seu navegador. Saiba
                            como protegemos seus dados na{' '}
                            <Link href="/politica-de-privacidade">Política de Privacidade</Link>.
                        </p>
                        <div className="cookie-actions">
                            <button className="btn-accept" onClick={acceptCookies}>
                                Entendi e fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
