'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { mapPublicTree } from '@/lib/i18n/tree';
import type { PublicLocale } from '@/lib/i18n/config';

export interface TranslationContextValue {
    locale: PublicLocale;
    messages: Record<string, string>;
    enabled: boolean;
}
const Context = createContext<TranslationContextValue>({
    locale: 'pt',
    messages: {},
    enabled: false,
});

export default function TranslationProvider({
    children,
    ...value
}: TranslationContextValue & { children: ReactNode }) {
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePublicTranslation() {
    return useContext(Context);
}

/** Translation is part of the React render, not a mutation of hydrated DOM nodes. */
export function TranslatedContent({ children }: { children: ReactNode }) {
    const { messages, locale } = usePublicTranslation();
    const translated = locale !== 'pt' && Object.keys(messages).length > 0;
    const content = mapPublicTree(children, (text) => messages[text] ?? text);
    if (!translated) return <>{content}</>;
    return (
        <div
            className="translated-interface"
            lang={`${locale}-x-mtfrom-pt`}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
            {content}
        </div>
    );
}
