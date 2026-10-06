import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { recordAudit } from '@/lib/server/audit';
import { loginWithGoogleProfile } from '@/lib/server/auth';
import { env, isGoogleOAuthEnabled } from '@/lib/server/env';
import { logError } from '@/lib/server/logger';
import { isWorkspaceIdentity, workspaceDomain } from '@/lib/config/workspace-auth';
import { googleOAuthRateLimitResponse } from '@/lib/server/oauth-rate-limit';
import { readBoundedJson } from '@/lib/server/bounded-json';

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
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
    timeoutDuration: 5000,
});
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    if (!isGoogleOAuthEnabled() || !workspaceDomain(env.google.allowedDomain)) {
        return new NextResponse('Não encontrado.', { status: 404 });
    }

    const store = await cookies();
    const expectedState = store.get(STATE_COOKIE)?.value ?? '';
    const verifier = store.get(VERIFIER_COOKIE)?.value ?? '';
    const expectedNonce = store.get(NONCE_COOKIE)?.value ?? '';

    const clearTemporaryCookies = (): void => {
        // Browsers reject even an expired __Host- cookie unless Secure and Path=/
        // are present. Next's generic delete omits Secure; preserve issuance scope.
        for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NONCE_COOKIE]) {
            store.set(name, '', {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 0,
                expires: new Date(0),
                priority: 'high',
            });
        }
    };

    const toLogin = (message: string): NextResponse =>
        NextResponse.redirect(
            new URL(`/atendente?erro=${encodeURIComponent(message)}`, env.appUrl),
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
    if (
        !state ||
        !/^[A-Za-z0-9_-]{32}$/.test(state) ||
        !expectedState ||
        !safeEqual(state, expectedState)
    ) {
        // Uma requisição externa não pode interromper um fluxo legítimo em andamento.
        return toLogin('Sessão de login expirada. Tente novamente.');
    }

    const limited = await googleOAuthRateLimitResponse('callback');
    if (limited) return limited;

    if (googleError) {
        const safeError = googleError.replace(/[^a-z0-9_.-]/gi, '').slice(0, 60);
        return reject('Autorização cancelada no Google.', `google-error-${safeError}`);
    }

    if (
        !code ||
        code.length > 4096 ||
        !/^[A-Za-z0-9_-]{64}$/.test(verifier) ||
        !/^[A-Za-z0-9_-]{32}$/.test(expectedNonce)
    ) {
        return reject('Sessão de login expirada. Tente novamente.', 'parametros-ausentes');
    }

    // Consome o estado antes da chamada de rede, inclusive se o provedor falhar.
    clearTemporaryCookies();

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
            signal: AbortSignal.timeout(10_000),
            redirect: 'error',
        });

        if (!response.ok) {
            return reject(
                'Não foi possível concluir o login com o Google.',
                `troca-de-codigo-${response.status}`,
            );
        }

        const data = (await readBoundedJson(response, 64 * 1024)) as { id_token?: string };
        idToken =
            typeof data.id_token === 'string' && data.id_token.length <= 16_384
                ? data.id_token
                : undefined;
    } catch (error) {
        logError('auth.google_token_exchange_failed', error);
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
            requiredClaims: ['exp', 'iat', 'sub', 'nonce', 'email', 'email_verified', 'hd'],
        }));
    } catch (error) {
        logError('auth.google_id_token_invalid', error);
        return reject('Credencial do Google não reconhecida.', 'id-token-invalido');
    }

    const email = typeof payload.email === 'string' ? payload.email : '';
    const subject = typeof payload.sub === 'string' ? payload.sub : '';
    const nonce = typeof payload.nonce === 'string' ? payload.nonce : '';
    const hostedDomain = typeof payload.hd === 'string' ? payload.hd : '';
    const name = typeof payload.name === 'string' ? payload.name : undefined;

    if (payload.azp !== undefined && payload.azp !== env.google.clientId) {
        return reject('Credencial do Google não reconhecida.', 'apresentador-invalido');
    }

    if (!nonce || !safeEqual(nonce, expectedNonce)) {
        return reject('Credencial do Google não reconhecida.', 'nonce-invalido', email);
    }

    if (payload.email_verified !== true) {
        return reject('Credencial do Google não reconhecida.', 'email-nao-verificado', email);
    }

    if (
        !isWorkspaceIdentity(
            {
                sub: subject,
                email,
                emailVerified: payload.email_verified === true,
                hd: hostedDomain,
            },
            workspaceDomain(env.google.allowedDomain),
        )
    ) {
        return reject(
            'Use a conta do domínio institucional do SPM.',
            'dominio-nao-permitido',
            email,
        );
    }

    if (!subject || !email || subject.length > 255 || email.length > 254) {
        return reject('Não foi possível concluir o login com o Google.', 'perfil-incompleto');
    }

    let result;
    try {
        result = await loginWithGoogleProfile({
            sub: subject,
            email,
            name,
            hd: hostedDomain || undefined,
            emailVerified: true,
        });
    } catch (error) {
        logError('auth.google_login_failed', error);
        return toLogin('Não foi possível entrar agora. Tente novamente em instantes.');
    }

    clearTemporaryCookies();

    if (!result.ok) {
        return toLogin(result.error);
    }

    return NextResponse.redirect(new URL('/admin', env.appUrl));
}
