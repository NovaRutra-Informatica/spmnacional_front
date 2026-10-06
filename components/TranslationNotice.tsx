import type { PublicLocale } from '@/lib/i18n/config';

const notices: Record<PublicLocale, { automatic: string; fallback: string }> = {
    pt: {
        automatic: 'Tradução automática',
        fallback: 'Tradução indisponível no momento. Exibindo o original em português.',
    },
    en: {
        automatic: 'Automatic translation',
        fallback: 'Translation is currently unavailable. The Portuguese original is shown.',
    },
    es: {
        automatic: 'Traducción automática',
        fallback: 'La traducción no está disponible. Se muestra el original en portugués.',
    },
    fr: {
        automatic: 'Traduction automatique',
        fallback: 'La traduction est indisponible. Le texte original en portugais est affiché.',
    },
    ar: {
        automatic: 'ترجمة آلية',
        fallback: 'الترجمة غير متاحة حالياً. يُعرض النص الأصلي باللغة البرتغالية.',
    },
};

export default function TranslationNotice({
    locale,
    translated,
}: {
    locale: PublicLocale;
    translated: boolean;
}) {
    if (locale === 'pt') return null;
    return (
        <aside
            className="translation-notice"
            lang={locale}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
            role="status"
        >
            {translated ? (
                <>
                    {notices[locale].automatic} ·{' '}
                    <a
                        href="https://translate.google.com"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/assets/google-translate-attribution.png"
                            alt="Powered by Google Translate"
                        />
                    </a>
                </>
            ) : (
                notices[locale].fallback
            )}{' '}
            <a href="/sobre-as-traducoes" lang="pt-BR">
                Sobre as traduções
            </a>
        </aside>
    );
}
