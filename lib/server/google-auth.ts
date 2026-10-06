import 'server-only';

import { createSign } from 'node:crypto';
import { readBoundedJson } from './bounded-json';

/**
 * Obtenção de token de acesso do Google sem SDK.
 *
 * Dois caminhos, nesta ordem:
 * 1. Servidor de metadados — funciona automaticamente no Cloud Run, Cloud
 *    Functions, GCE e GKE, usando a conta de serviço anexada ao serviço.
 * 2. Chave JSON de conta de serviço em GOOGLE_APPLICATION_CREDENTIALS —
 *    usada fora do GCP (máquina do desenvolvedor, outra nuvem).
 *
 * Evita arrastar o SDK do Google, que é grande e traz cadeia de dependências
 * que não queremos numa aplicação pequena.
 */

const METADATA_HOST = 'http://metadata.google.internal';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface CachedToken {
    token: string;
    expiresAt: number;
}

const cache = new Map<string, CachedToken>();
const pending = new Map<string, Promise<string | null>>();

function readToken(data: unknown): { token: string; lifetime: number } | null {
    if (!data || typeof data !== 'object') return null;
    const { access_token: token, expires_in: lifetime } = data as Record<string, unknown>;
    if (
        typeof token !== 'string' ||
        !token ||
        token.length > 16_384 ||
        typeof lifetime !== 'number' ||
        !Number.isFinite(lifetime) ||
        lifetime <= 0 ||
        lifetime > 86_400
    )
        return null;
    return { token, lifetime };
}

function cacheKey(scopes: string[]): string {
    return scopes.slice().sort().join(' ');
}

async function tokenFromMetadataServer(scopes: string[]): Promise<string | null> {
    try {
        const url = new URL(
            '/computeMetadata/v1/instance/service-accounts/default/token',
            METADATA_HOST,
        );
        url.searchParams.set('scopes', scopes.join(','));

        const response = await fetch(url, {
            headers: { 'Metadata-Flavor': 'Google' },
            signal: AbortSignal.timeout(2000),
            cache: 'no-store',
            redirect: 'error',
        });

        if (!response.ok || response.headers.get('Metadata-Flavor') !== 'Google') return null;

        const data = readToken(await readBoundedJson(response, 64 * 1024));
        if (!data) return null;

        cache.set(cacheKey(scopes), {
            token: data.token,
            expiresAt: Date.now() + data.lifetime * 1000 - 60_000,
        });
        return data.token;
    } catch {
        // Fora do GCP o servidor de metadados simplesmente não existe.
        return null;
    }
}

interface ServiceAccountKey {
    client_email: string;
    private_key: string;
    token_uri?: string;
}

function base64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url');
}

async function tokenFromServiceAccountFile(scopes: string[]): Promise<string | null> {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!keyPath) return null;

    try {
        const { readFile } = await import('node:fs/promises');
        const raw = await readFile(keyPath, 'utf8');
        const key = JSON.parse(raw) as ServiceAccountKey;
        if (
            typeof key.client_email !== 'string' ||
            typeof key.private_key !== 'string' ||
            !key.client_email ||
            !key.private_key ||
            (key.token_uri && key.token_uri !== TOKEN_ENDPOINT)
        )
            return null;

        const now = Math.floor(Date.now() / 1000);
        const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        const claims = base64url(
            JSON.stringify({
                iss: key.client_email,
                scope: scopes.join(' '),
                aud: TOKEN_ENDPOINT,
                iat: now,
                exp: now + 3600,
            }),
        );

        const signer = createSign('RSA-SHA256');
        signer.update(`${header}.${claims}`);
        const signature = signer.sign(key.private_key).toString('base64url');
        const assertion = `${header}.${claims}.${signature}`;

        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion,
            }),
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
            redirect: 'error',
        });

        if (!response.ok) return null;

        const data = readToken(await readBoundedJson(response, 64 * 1024));
        if (!data) return null;

        cache.set(cacheKey(scopes), {
            token: data.token,
            expiresAt: Date.now() + data.lifetime * 1000 - 60_000,
        });
        return data.token;
    } catch {
        return null;
    }
}

/**
 * Devolve um token de acesso para os escopos pedidos, ou null quando não há
 * credencial disponível. Quem chama deve tratar o null como "integração não
 * configurada" e seguir sem ela.
 */
export async function getGoogleAccessToken(scopes: string[]): Promise<string | null> {
    const key = cacheKey(scopes);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.token;
    }

    const existing = pending.get(key);
    if (existing) return existing;
    const refresh = (async () =>
        (await tokenFromMetadataServer(scopes)) ??
        (await tokenFromServiceAccountFile(scopes)))().finally(() => pending.delete(key));
    pending.set(key, refresh);
    return refresh;
}

export const GOOGLE_SCOPES = {
    storageReadWrite: 'https://www.googleapis.com/auth/devstorage.read_write',
    calendarReadonly: 'https://www.googleapis.com/auth/calendar.readonly',
    driveReadonly: 'https://www.googleapis.com/auth/drive.readonly',
    gmailSend: 'https://www.googleapis.com/auth/gmail.send',
    spreadsheets: 'https://www.googleapis.com/auth/spreadsheets',
} as const;
