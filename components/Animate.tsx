'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ElementType, ReactNode } from 'react';

interface AnimateProps {
    /** Tag renderizada. Mantém o mesmo elemento que existia no template Angular. */
    as?: ElementType;
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
}

/**
 * Equivalente da diretiva `appAnimate` do Angular.
 *
 * Renderiza o próprio elemento (não um wrapper), aplica `hidden-element`
 * ao montar no navegador e troca para `animate-fade-up` quando entra na
 * viewport — exatamente o comportamento anterior.
 */
export default function Animate({ as = 'div', className, style, children }: AnimateProps) {
    const ref = useRef<HTMLElement | null>(null);
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

    return createElement(as as string, { ref, className: classes || undefined, style }, children);
}
