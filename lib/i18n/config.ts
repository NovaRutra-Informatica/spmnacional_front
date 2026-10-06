/** Idiomas públicos; ampliar esta lista exige revisar catálogo, RTL e custos. */
export const SOURCE_LOCALE = 'pt' as const;
export const SUPPORTED_LOCALES = ['pt', 'en', 'fr', 'es', 'ar'] as const;
export type PublicLocale = (typeof SUPPORTED_LOCALES)[number];
export type TranslationLocale = Exclude<PublicLocale, typeof SOURCE_LOCALE>;
export const LOCALE_LABELS: Record<PublicLocale, string> = {
    pt: 'Português',
    en: 'English',
    fr: 'Français',
    es: 'Español',
    ar: 'العربية',
};

export function isPublicLocale(value: unknown): value is PublicLocale {
    return typeof value === 'string' && SUPPORTED_LOCALES.some((locale) => locale === value);
}

export function normalizePublicLocale(value: unknown): PublicLocale {
    return isPublicLocale(value) ? value : SOURCE_LOCALE;
}

export function localeDirection(locale: PublicLocale): 'ltr' | 'rtl' {
    return locale === 'ar' ? 'rtl' : 'ltr';
}
