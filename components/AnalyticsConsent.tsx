'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from './LocalizedLink';
import { createAnalyticsController, browserAnalyticsPort } from '@/lib/analytics-browser';
import {
    readAnalyticsConsent,
    saveAnalyticsConsent,
    type AnalyticsConsentChoice,
} from '@/lib/config/analytics';

export default function AnalyticsConsent({
    measurementId,
    nonce,
    onResolved,
}: {
    measurementId: string;
    nonce?: string;
    onResolved: (resolved: boolean) => void;
}) {
    const pathname = usePathname();
    const [choice, setChoice] = useState<AnalyticsConsentChoice>('unknown');
    const [preferencesOpen, setPreferencesOpen] = useState(false);
    const [privacySignal, setPrivacySignal] = useState(false);
    const controller = useRef<ReturnType<typeof createAnalyticsController> | null>(null);

    useEffect(() => {
        const port = browserAnalyticsPort(measurementId);
        const blocked =
            port.signals.globalPrivacyControl === true ||
            ['1', 'yes'].includes(port.signals.doNotTrack ?? '');
        controller.current = createAnalyticsController(measurementId, port, nonce);
        setPrivacySignal(blocked);
        let stored: AnalyticsConsentChoice = 'unknown';
        try {
            stored = readAnalyticsConsent(window.localStorage);
        } catch {
            /* Browser storage is optional. */
        }
        setChoice(blocked ? 'denied' : stored);
        return () => {
            controller.current?.stop();
            controller.current = null;
        };
    }, [measurementId, nonce]);

    useEffect(() => {
        controller.current?.update(choice, pathname);
        onResolved(choice !== 'unknown' && !preferencesOpen);
    }, [choice, pathname, preferencesOpen, onResolved]);

    function choose(value: 'granted' | 'denied') {
        try {
            saveAnalyticsConsent(window.localStorage, value);
        } catch {
            /* Honor this document's choice. */
        }
        setChoice(value);
        setPreferencesOpen(false);
    }

    return (
        <>
            {choice !== 'unknown' && !preferencesOpen && (
                <button className="analytics-preferences" onClick={() => setPreferencesOpen(true)}>
                    Preferências de privacidade
                </button>
            )}
            {(choice === 'unknown' || preferencesOpen) && (
                <section
                    className="cookie-banner analytics-consent"
                    aria-label="Preferências de privacidade"
                >
                    <div className="cookie-content">
                        <div>
                            <p>
                                Com sua autorização, usamos Google Analytics para entender quais
                                páginas públicas são visitadas. Você pode recusar e continuar usando
                                o site normalmente. Leia a{' '}
                                <Link href="/politica-de-privacidade">Política de Privacidade</Link>
                                .
                            </p>
                            {privacySignal && (
                                <p>
                                    Seu navegador solicita privacidade. A medição permanece
                                    desativada.
                                </p>
                            )}
                        </div>
                        <div className="cookie-actions">
                            <button className="btn-accept" onClick={() => choose('denied')}>
                                Somente essenciais
                            </button>
                            {!privacySignal && (
                                <button className="btn-accept" onClick={() => choose('granted')}>
                                    Permitir Analytics
                                </button>
                            )}
                        </div>
                    </div>
                </section>
            )}
        </>
    );
}
