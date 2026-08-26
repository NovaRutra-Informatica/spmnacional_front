import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { recordAudit } from '@/lib/server/audit';
import { loginWithGoogleProfile } from '@/lib/server/auth';
import { env, isGoogleOAuthEnabled } from '@/lib/server/env';

/**
 * Retorno do Google: valida o `state`, troca o código por tokens usando o
 * `code_verifier` do PKCE e abre a sessão do painel.
 */

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'g_state';
const VERIFIER_COOKIE = 'g_verifier';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const EMISSORES_VALIDOS = ['accounts.google.com', 'https://accounts.google.com'];

interface GoogleIdToken {
    aud?: string;
    iss?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    hd?: string;
}

/**
 * Lê o payload do id_token sem conferir a assinatura.
 *
 * A verificação criptográfica é dispensada aqui porque o token não passou pelo
 * navegador: nós mesmos o buscamos no endpoint do Google, sobre TLS e
 * autenticando com o `client_secret`. Não há por onde um terceiro injetar outro
 * token nesse caminho. (No fluxo implícito, em que o token chega pela URL, a
 * conferência da assinatura seria obrigatória.)
 */
function lerIdToken(idToken: string): GoogleIdToken | null {
    const partes = idToken.split('.');
    if (partes.length !== 3) return null;

    try {
        const payload = Buffer.from(partes[1] ?? '', 'base64url').toString('utf8');
        return JSON.parse(payload) as GoogleIdToken;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    if (!isGoogleOAuthEnabled()) {
        return new NextResponse('Não encontrado.', { status: 404 });
    }

    const store = await cookies();
    const stateEsperado = store.get(STATE_COOKIE)?.value ?? '';
    const verifier = store.get(VERIFIER_COOKIE)?.value ?? '';

    // Os temporários morrem em qualquer desfecho: sucesso, recusa ou erro.
    const limparTemporarios = (): void => {
        store.delete(STATE_COOKIE);
        store.delete(VERIFIER_COOKIE);
    };

    const paraLogin = (mensagem: string): NextResponse =>
        NextResponse.redirect(
            new URL(`/atendente?erro=${encodeURIComponent(mensagem)}`, request.url),
        );

    /** Recusa auditada: a mensagem é curta e o motivo técnico fica no log. */
    const recusar = async (
        mensagem: string,
        motivo: string,
        email?: string,
    ): Promise<NextResponse> => {
        await recordAudit({
            action: 'Login com Google recusado',
            target: email || 'origem desconhecida',
            level: 'ALERTA',
            actorLabel: email || 'google-oauth',
            metadata: { motivo },
        });
        limparTemporarios();
        return paraLogin(mensagem);
    };

    const parametros = request.nextUrl.searchParams;
    const erroGoogle = parametros.get('error');
    const code = parametros.get('code');
    const state = parametros.get('state');

    if (erroGoogle) {
        // O motivo vem da URL: entra no log recortado, e nunca na tela.
        return recusar(
            'Autorização cancelada no Google.',
            `google-error-${erroGoogle.slice(0, 60)}`,
        );
    }

    if (!code || !state) {
        return recusar('Resposta inválida do Google.', 'parametros-ausentes');
    }

    // Sem `state` conferido, qualquer site poderia disparar o retorno por nós.
    if (!stateEsperado || state !== stateEsperado) {
        return recusar('Sessão de login expirada. Tente novamente.', 'state-invalido');
    }

    if (!verifier) {
        return recusar('Sessão de login expirada. Tente novamente.', 'verifier-ausente');
    }

    let idToken: string | undefined;

    try {
        const resposta = await fetch(TOKEN_ENDPOINT, {
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

        if (!resposta.ok) {
            return recusar(
                'Não foi possível concluir o login com o Google.',
                `troca-de-codigo-${resposta.status}`,
            );
        }

        const dados = (await resposta.json()) as { id_token?: string };
        idToken = dados.id_token;
    } catch (error) {
        console.error('[google oauth] falha na troca do código:', error);
        return recusar('Não foi possível falar com o Google. Tente novamente.', 'token-endpoint');
    }

    if (!idToken) {
        return recusar('Não foi possível concluir o login com o Google.', 'id-token-ausente');
    }

    const payload = lerIdToken(idToken);

    if (!payload) {
        return recusar('Não foi possível concluir o login com o Google.', 'id-token-ilegivel');
    }

    if (payload.aud !== env.google.clientId) {
        return recusar('Credencial do Google não reconhecida.', 'aud-invalido');
    }

    if (!payload.iss || !EMISSORES_VALIDOS.includes(payload.iss)) {
        return recusar('Credencial do Google não reconhecida.', 'iss-invalido');
    }

    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
        return recusar('Credencial do Google expirada. Tente novamente.', 'exp-vencido');
    }

    // O Google devolve booleano; alguns proxies serializam como texto.
    const emailVerificado = payload.email_verified === true || payload.email_verified === 'true';

    if (!emailVerificado) {
        return recusar(
            'O e-mail desta conta Google não está verificado.',
            'email-nao-verificado',
            payload.email,
        );
    }

    if (env.google.allowedDomain && payload.hd !== env.google.allowedDomain) {
        return recusar(
            'Use a conta do domínio institucional do SPM.',
            'dominio-nao-permitido',
            payload.email,
        );
    }

    if (!payload.sub || !payload.email) {
        return recusar('Não foi possível concluir o login com o Google.', 'perfil-incompleto');
    }

    const resultado = await loginWithGoogleProfile({
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        hd: payload.hd,
    });

    limparTemporarios();

    if (!resultado.ok) {
        // `loginWithGoogleProfile` já auditou a recusa; aqui só levamos de volta.
        return paraLogin(resultado.error);
    }

    return NextResponse.redirect(new URL('/admin', request.url));
}
