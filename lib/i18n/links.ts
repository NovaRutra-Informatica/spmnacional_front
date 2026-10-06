import { normalizePublicLocale, type PublicLocale } from './config';

export function isPrivatePath(path: string): boolean {
    return ['/admin', '/atendente', '/convite', '/api', '/newsletter/confirmar'].some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
}

export function localizeHref(href: string, locale: PublicLocale): string {
    if (!href.startsWith('/') || href.startsWith('//')) return href;
    const url = new URL(href, 'https://local.invalid');
    if (isPrivatePath(url.pathname) || /\.[a-z0-9]+$/i.test(url.pathname)) return href;
    if (normalizePublicLocale(locale) === 'pt') url.searchParams.delete('lang');
    else url.searchParams.set('lang', locale);
    return `${url.pathname}${url.search}${url.hash}`;
}
