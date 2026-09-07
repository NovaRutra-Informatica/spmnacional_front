import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { recordAudit } from '@/lib/server/audit';
import { loginWithGoogleProfile } from '@/lib/server/auth';
import { env, isGoogleOAuthEnabled } from '@/lib/server/env';

/**
 * Retorno do Google: valida state, PKCE, nonce e a assinatura do ID token
 * antes de abrir uma sessão administrativa.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_PREFIX = process.env.NODE_ENV === 'production' ? '__Host-' : '';
const STATE_COOKIE = `${COOKIE_PREFIX}g_state`;
const VERIFIER_COOKIE = `${COOKIE_PREFIX}g_verifier`;
const NONCE_COOKIE = `${COOKIE_PREFIX}g_nonce`;
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    if (!isGoogleOAuthEnabled()) {
        return new NextResponse('Não encontrado.', { status: 404 });
    }

    const store = await cookies();
    const expectedState = store.get(STATE_COOKIE)?.value ?? '';
    const verifier = store.get(VERIFIER_COOKIE)?.value ?? '';
    const expectedNonce = store.get(NONCE_COOKIE)?.value ?? '';

    const clearTemporaryCookies = (): void => {
        store.delete(STATE_COOKIE);
        store.delete(VERIFIER_COOKIE);
        store.delete(NONCE_COOKIE);
    };

    const toLogin = (message: string): NextResponse =>
        NextResponse.redirect(
            new URL(`/atendente?erro=${encodeURIComponent(message)}`, request.url),
        );

    const reject = async (
        message: string,
        reason: string,
        email?: string,
    ): Promise<NextResponse> => {
        await recordAudit({
            action: 'Login com Google recusado',
            target: email || 'origem não identificada',
            level: 'ALERTA',
            actorLabel: email || 'google-oauth',
            metadata: { reason },
        });
        clearTemporaryCookies();
        return toLogin(message);
    };

    const params = request.nextUrl.searchParams;
    const googleError = params.get('error');
    const code = params.get('code');
    const state = params.get('state');

    // Inclusive respostas de cancelamento precisam pertencer ao fluxo iniciado
    // neste navegador; isso evita apagar cookies ou poluir auditoria via CSRF.
    if (!state || !expectedState || !safeEqual(state, expectedState)) {
        return reject('Sessão de login expirada. Tente novamente.', 'state-invalido');
    }

    if (googleError) {
        const safeError = googleError.replace(/[^a-z0-9_.-]/gi, '').slice(0, 60);
        return reject('Autorização cancelada no Google.', `google-error-${safeError}`);
    }

    if (!code || !verifier || !expectedNonce) {
        return reject('Sessão de login expirada. Tente novamente.', 'parametros-ausentes');
    }

    let idToken: string | undefined;

    try {
        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: env.google.clientId,
                client_secret: env.google.clientSecret,
                redirect_uri: `${env.appUrl.replace(/\/+$/, '')}/api/auth/google/callback`,
                grant_type: 'authorization_code',
                code_verifier: verifier,
            }),
            cache: 'no-store',
        });

        if (!response.ok) {
            return reject(
                'Não foi possível concluir o login com o Google.',
                `troca-de-codigo-${response.status}`,
            );
        }

        const data = (await response.json()) as { id_token?: string };
        idToken = data.id_token;
    } catch (error) {
        console.error('[google oauth] falha na troca do código:', error);
        return reject('Não foi possível falar com o Google. Tente novamente.', 'token-endpoint');
    }

    if (!idToken) {
        return reject('Não foi possível concluir o login com o Google.', 'id-token-ausente');
    }

    let payload;
    try {
        ({ payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
            algorithms: ['RS256'],
            audience: env.google.clientId,
            issuer: VALID_ISSUERS,
            clockTolerance: 5,
            maxTokenAge: '10m',
        }));
    } catch (error) {
        console.error('[google oauth] ID token inválido:', error);
        return reject('Credencial do Google não reconhecida.', 'id-token-invalido');
    }

    const email = typeof payload.email === 'string' ? payload.email : '';
    const subject = typeof payload.sub === 'string' ? payload.sub : '';
    const nonce = typeof payload.nonce === 'string' ? payload.nonce : '';
    const hostedDomain = typeof payload.hd === 'string' ? payload.hd : '';
    const name = typeof payload.name === 'string' ? payload.name : undefined;

    if (!nonce || !safeEqual(nonce, expectedNonce)) {
        return reject('Credencial do Google não reconhecida.', 'nonce-invalido', email);
    }

    if (payload.email_verified !== true) {
        return reject('Credencial do Google não reconhecida.', 'email-nao-verificado', email);
    }

    if (env.google.allowedDomain && hostedDomain !== env.google.allowedDomain) {
        return reject(
            'Use a conta do domínio institucional do SPM.',
            'dominio-nao-permitido',
            email,
        );
    }

    if (!subject || !email || subject.length > 255 || email.length > 254) {
        return reject('Não foi possível concluir o login com o Google.', 'perfil-incompleto');
    }

    const result = await loginWithGoogleProfile({
        sub: subject,
        email,
        name,
        hd: hostedDomain || undefined,
    });

    clearTemporaryCookies();

    if (!result.ok) {
        return toLogin(result.error);
    }

    return NextResponse.redirect(new URL('/admin', request.url));
}
