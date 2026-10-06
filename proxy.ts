import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { isSessionToken } from './lib/server/auth-security';
import { contentSecurityPolicy } from './lib/content-security-policy';
import { normalizePublicLocale } from './lib/i18n/config';
import { isPrivatePath } from './lib/i18n/links';
import { readAnalyticsConfig } from './lib/config/analytics';
import { isPublicIndexingEnabled } from './lib/seo';

const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-spm_session' : 'spm_session';

/**
 * Barreira barata na borda: sem cookie de sessão, nem chega a renderizar o
 * painel. A verificação de verdade (token válido, sessão não expirada, conta
 * ativa, permissão) acontece no servidor, em `app/admin/layout.tsx` e em cada
 * Server Action — o middleware só evita trabalho inútil e o piscar de tela.
 */
export function proxy(request: NextRequest) {
    const isPrivate = isPrivatePath(request.nextUrl.pathname);
    const requestedLocale =
        request.nextUrl.searchParams.get('lang') ?? request.cookies.get('spm_locale')?.value;
    const locale = isPrivate ? 'pt' : normalizePublicLocale(requestedLocale);
    const localeHeaders = new Headers(request.headers);
    localeHeaders.set('x-spm-locale', locale);
    localeHeaders.set('x-spm-pathname', request.nextUrl.pathname);
    const nonce = randomBytes(32).toString('base64');
    const policy = contentSecurityPolicy(process.env.NODE_ENV === 'production', nonce, !isPrivate && readAnalyticsConfig(process.env).enabled);
    // Neither a visitor's nonce nor their CSP header may influence trusted scripts.
    localeHeaders.set('x-nonce', nonce);
    localeHeaders.set('Content-Security-Policy', policy);
    if (!isPrivate) {
        const response = NextResponse.next({ request: { headers: localeHeaders } });
        // Personalized language must never leak from a shared page cache.
        response.headers.set('Cache-Control', 'private, no-store, max-age=0');
        response.headers.set('Vary', 'Cookie');
        response.headers.set('Content-Security-Policy', policy);
        if (!isPublicIndexingEnabled(process.env.APP_URL)) response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        else if (locale !== 'pt') response.headers.set('X-Robots-Tag', 'noindex, follow');
        if (request.nextUrl.searchParams.has('lang'))
            response.cookies.set('spm_locale', locale, {
                httpOnly: true,
                sameSite: 'lax',
                secure: request.nextUrl.protocol === 'https:',
                path: '/',
                maxAge: 31536000,
            });
        return response;
    }
    const requestHeaders = localeHeaders;
    // Sempre sobrescreve: um nonce enviado pelo visitante não tem autoridade.
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', policy);
    const hasSession = isSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    const isAdmin =
        request.nextUrl.pathname === '/admin' || request.nextUrl.pathname.startsWith('/admin/');

    const secureResponse = (response: NextResponse) => {
        response.headers.set('Content-Security-Policy', policy);
        response.headers.set('Cache-Control', 'private, no-store, max-age=0');
        response.headers.set('Referrer-Policy', 'no-referrer');
        response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return response;
    };

    if (isAdmin && !hasSession) {
        const url = request.nextUrl.clone();
        url.pathname = '/atendente';
        url.search = `?proximo=${encodeURIComponent(request.nextUrl.pathname)}`;
        return secureResponse(NextResponse.redirect(url));
    }

    return secureResponse(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
    matcher: ['/((?!api|_next|assets|.*\\.[^/]+$).*)'],
};
