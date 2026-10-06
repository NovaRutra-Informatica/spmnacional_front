'use client';

import { usePathname } from 'next/navigation';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@/lib/i18n/config';
import { isPrivatePath } from '@/lib/i18n/links';
import { usePublicTranslation } from './TranslationProvider';

export default function LanguageSelector() {
    const pathname = usePathname();
    const { locale, enabled } = usePublicTranslation();
    if (isPrivatePath(pathname) || process.env.NEXT_PUBLIC_STATIC_DEMO === 'true') return null;
    return (
        <form className="language-selector" action={pathname} method="get" translate="no">
            <label htmlFor="public-language" title="Google Translate">
                <i className="fas fa-globe" aria-hidden="true" />
                <span className="sr-only">Idioma / Language — Google Translate</span>
            </label>
            <select
                id="public-language"
                name="lang"
                defaultValue={locale}
                aria-label="Idioma / Language"
                disabled={!enabled}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
                {SUPPORTED_LOCALES.map((language) => (
                    <option key={language} value={language} lang={language}>
                        {LOCALE_LABELS[language]}
                    </option>
                ))}
            </select>
            <noscript>
                <button type="submit">OK</button>
            </noscript>
            {!enabled && <span className="sr-only">Tradução aguardando configuração.</span>}
        </form>
    );
}
