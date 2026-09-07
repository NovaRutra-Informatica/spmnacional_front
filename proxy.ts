import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-spm_session' : 'spm_session';

/**
 * Barreira barata na borda: sem cookie de sessão, nem chega a renderizar o
 * painel. A verificação de verdade (token válido, sessão não expirada, conta
 * ativa, permissão) acontece no servidor, em `app/admin/layout.tsx` e em cada
 * Server Action — o middleware só evita trabalho inútil e o piscar de tela.
 */
export function proxy(request: NextRequest) {
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

    if (!hasSession) {
        const url = request.nextUrl.clone();
        url.pathname = '/atendente';
        url.search = `?proximo=${encodeURIComponent(request.nextUrl.pathname)}`;
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*'],
};
