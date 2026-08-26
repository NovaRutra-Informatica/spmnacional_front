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

    const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

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
            >
                <i className="fas fa-arrow-up"></i>
            </button>

            <div className="mobile-sticky-bar">
                <div className="sticky-content">
                    <span className="sticky-text">Ajude a transformar vidas</span>
                    <Link href="/como-ajudar" className="btn-sticky-donate">
                        DOAR AGORA <i className="fas fa-heart pulse-icon"></i>
                    </Link>
                </div>
            </div>

            {mounted && !cookiesAccepted && (
                <div className="cookie-banner">
                    <div className="cookie-content">
                        <p>
                            Utilizamos cookies para oferecer a melhor experiência e analisar o uso
                            do nosso site. Ao continuar, você concorda com nossa{' '}
                            <Link href="/politica-de-privacidade">Política de Privacidade</Link>.
                        </p>
                        <div className="cookie-actions">
                            <button className="btn-accept" onClick={acceptCookies}>
                                Aceitar e Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
