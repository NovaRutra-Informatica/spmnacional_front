'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface AnimateLinkProps {
    /** Destino do antigo `routerLink`. */
    href: string;
    className?: string;
    children?: ReactNode;
}

/**
 * Âncora que no Angular acumulava `routerLink` e a diretiva `appAnimate`
 * no mesmo elemento (ex.: `<a class="card" routerLink="/x" appAnimate>`).
 *
 * Mantém o próprio `<a>` como elemento animado — mesma mecânica do
 * `Animate` (classe `hidden-element` ao montar, `animate-fade-up` ao
 * entrar na viewport), porém navegando pelo roteador do Next.
 */
export default function AnimateLink({ href, className, children }: AnimateLinkProps) {
    const ref = useRef<HTMLAnchorElement | null>(null);
    const [phase, setPhase] = useState<'idle' | 'hidden' | 'visible'>('idle');

    useEffect(() => {
        const element = ref.current;

        // Ambientes sem IntersectionObserver: mostra o conteúdo direto.
        if (!element || typeof IntersectionObserver === 'undefined') {
            setPhase('visible');
            return;
        }

        setPhase('hidden');

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setPhase('visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.1 },
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const classes = [
        className,
        phase !== 'idle' ? 'hidden-element' : null,
        phase === 'visible' ? 'animate-fade-up' : null,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <Link ref={ref} href={href} className={classes || undefined}>
            {children}
        </Link>
    );
}
