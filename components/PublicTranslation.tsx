import type { ReactNode } from 'react';
import { collectPublicText, mapPublicTree } from '@/lib/i18n/tree';
import { getPublicLocale, getPublicPathname } from '@/lib/server/public-locale';
import { loadInterfaceTranslations } from '@/lib/server/interface-translation';
import { translatePublicFields } from '@/lib/server/translation';
import TranslationNotice from './TranslationNotice';
import TranslationProvider from './TranslationProvider';

/** Only wrap public editorial content, never admin pages or user-submitted form values. */
export default async function PublicTranslation({
    children,
    pageKey,
}: {
    children: ReactNode;
    pageKey: string;
}) {
    const locale = await getPublicLocale();
    if (locale === 'pt') return <>{children}</>;
    const texts = collectPublicText(children);
    const fields = Object.fromEntries(texts.map((text, index) => [`t${index}`, text]));
    const [ui, content] = await Promise.all([
        loadInterfaceTranslations(locale, await getPublicPathname()),
        texts.length ? translatePublicFields({ key: `page:${pageKey}`, locale, fields }) : null,
    ]);
    const result = content ?? { fields, translated: ui.translated };
    const dictionary = new Map(
        texts.map((text, index) => [text, result.fields[`t${index}`] ?? text]),
    );
    return (
        <TranslationProvider
            locale={locale}
            messages={ui.messages}
            enabled={process.env.TRANSLATION_ENABLED === 'true'}
        >
            <div
                className="public-translation"
                lang={result.translated ? `${locale}-x-mtfrom-pt` : 'pt-BR'}
                dir={result.translated && locale === 'ar' ? 'rtl' : 'ltr'}
            >
                <TranslationNotice locale={locale} translated={result.translated} />
                {mapPublicTree(children, (text) => dictionary.get(text) ?? text)}
            </div>
        </TranslationProvider>
    );
}
