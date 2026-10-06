'use client';
import { TranslatedContent } from '@/components/TranslationProvider';

import Link from '@/components/LocalizedLink';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isPrivatePath } from '@/lib/i18n/links';
import AnalyticsConsent from './AnalyticsConsent';

/**
 * Elementos flutuantes do site público: voltar ao topo, barra fixa de
 * contato e apoio no celular e aviso de cookies.
 */
export default function SiteChrome({ measurementId, nonce }: { measurementId?: string; nonce?: string }) {
    const pathname = usePathname();
    const analyticsActive = Boolean(measurementId) && !isPrivatePath(pathname);
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [cookiesAccepted, setCookiesAccepted] = useState(true);
    const [mounted, setMounted] = useState(false);
    const backToTopVisible = mounted && cookiesAccepted && showBackToTop;

    useEffect(() => {
        setMounted(true);
        if (analyticsActive) setCookiesAccepted(false);
        else {
            try { setCookiesAccepted(localStorage.getItem('spm_cookies') === 'true'); }
            catch { setCookiesAccepted(false); }
        }

        const onScroll = () => setShowBackToTop(window.scrollY > 400);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [analyticsActive]);

    const scrollToTop = () =>
        window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
        });

    const acceptCookies = () => {
        setCookiesAccepted(true);
        try { localStorage.setItem('spm_cookies', 'true'); } catch { /* Session-only acknowledgement. */ }
    };

    return (
        <TranslatedContent>
            {
                <>
                    <button
                        className={`btn-back-to-top${backToTopVisible ? ' show' : ''}`}
                        onClick={scrollToTop}
                        aria-label="Voltar ao topo"
                        aria-hidden={!backToTopVisible}
                        tabIndex={backToTopVisible ? 0 : -1}
                    >
                        <i className="fas fa-arrow-up" aria-hidden="true" />
                    </button>

                    {/* Controles fixos não podem cobrir a decisão de privacidade. */}
                    {mounted && cookiesAccepted && (
                        <>
                            <div
                                className="mobile-sticky-bar"
                                role="navigation"
                                aria-label="Contato e apoio"
                            >
                                <div className="sticky-content">
                                    <Link
                                        href="/fale-conosco#formulario"
                                        className="btn-sticky-donate"
                                    >
                                        Falar com a equipe
                                    </Link>
                                    <Link href="/como-ajudar" className="btn-sticky-support">
                                        Como ajudar
                                    </Link>
                                </div>
                            </div>
                            <div className="mobile-sticky-spacer" aria-hidden="true" />
                        </>
                    )}

                    {mounted && analyticsActive && measurementId && <AnalyticsConsent measurementId={measurementId} nonce={nonce} onResolved={setCookiesAccepted} />}
                    {mounted && !analyticsActive && !cookiesAccepted && (
                        <div className="cookie-banner">
                            <div className="cookie-content">
                                <p>
                                    Este site guarda apenas preferências essenciais no seu
                                    navegador. Saiba como protegemos seus dados na{' '}
                                    <Link href="/politica-de-privacidade">
                                        Política de Privacidade
                                    </Link>
                                    .
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
            }
        </TranslatedContent>
    );
}
