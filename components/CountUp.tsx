'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import type { ElementType } from 'react';

interface CountUpProps {
    /** Valor final da contagem. */
    end: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
    className?: string;
    as?: ElementType;
}

/**
 * Equivalente da diretiva `appCountUp` do Angular.
 *
 * O valor final já vai renderizado no HTML do servidor (bom para quem está
 * sem JavaScript e para o buscador); a contagem só começa quando o elemento
 * entra na viewport.
 */
export default function CountUp({
    end,
    duration = 2000,
    prefix = '',
    suffix = '',
    className,
    as = 'strong',
}: CountUpProps) {
    const ref = useRef<HTMLElement | null>(null);
    const [value, setValue] = useState(end);

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof IntersectionObserver === 'undefined') {
            return;
        }

        let frame = 0;
        let started = false;

        const animate = () => {
            let startTimestamp: number | null = null;

            const step = (timestamp: number) => {
                if (startTimestamp === null) {
                    startTimestamp = timestamp;
                }
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                const eased = 1 - (1 - progress) * (1 - progress);
                setValue(Math.floor(eased * end));

                if (progress < 1) {
                    frame = window.requestAnimationFrame(step);
                }
            };

            frame = window.requestAnimationFrame(step);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !started) {
                        started = true;
                        setValue(0);
                        animate();
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.2 },
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frame);
        };
    }, [end, duration]);

    return createElement(as as string, { ref, className }, `${prefix}${value}${suffix}`);
}
