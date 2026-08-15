import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { generateToken } from '@/lib/server/crypto';
import { env, isGoogleOAuthEnabled } from '@/lib/server/env';

/**
 * Início do fluxo Authorization Code + PKCE do Google Workspace.
 *
 * Sem biblioteca: são dois redirecionamentos e uma chamada HTTP, e o SDK do
 * Google traria uma cadeia de dependências grande demais para isso.
 */

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'g_state';
const VERIFIER_COOKIE = 'g_verifier';
/** Tempo suficiente para escolher a conta no Google, e nada além disso. */
const TEMP_COOKIE_MAX_AGE = 10 * 60;

export async function GET(): Promise<NextResponse> {
    // Sem credenciais configuradas a rota não existe — nem revela que existiria.
    if (!isGoogleOAuthEnabled()) {
        return new NextResponse('Não encontrado.', { status: 404 });
    }

    const state = generateToken(24);
    const verifier = generateToken(48);
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const store = await cookies();
    const opcoes = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: TEMP_COOKIE_MAX_AGE,
    };

    store.set(STATE_COOKIE, state, opcoes);
    store.set(VERIFIER_COOKIE, verifier, opcoes);

    const autorizacao = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    autorizacao.searchParams.set('client_id', env.google.clientId);
    autorizacao.searchParams.set(
        'redirect_uri',
        `${env.appUrl.replace(/\/+$/, '')}/api/auth/google/callback`,
    );
    autorizacao.searchParams.set('response_type', 'code');
    autorizacao.searchParams.set('scope', 'openid email profile');
    autorizacao.searchParams.set('state', state);
    autorizacao.searchParams.set('code_challenge', challenge);
    autorizacao.searchParams.set('code_challenge_method', 'S256');
    autorizacao.searchParams.set('access_type', 'online');
    autorizacao.searchParams.set('prompt', 'select_account');

    // Com domínio restrito, o próprio Google já filtra a lista de contas.
    if (env.google.allowedDomain) {
        autorizacao.searchParams.set('hd', env.google.allowedDomain);
    }

    return NextResponse.redirect(autorizacao);
}
