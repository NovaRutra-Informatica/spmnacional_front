import 'server-only';

import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { env } from './env';

const scrypt = promisify(scryptCallback) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
) => Promise<Buffer>;

// ---------------------------------------------------------
// Senhas — scrypt do próprio Node, sem dependência externa
// ---------------------------------------------------------

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/** Formato armazenado: `scrypt$<salt base64>$<hash base64>`. */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = await scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN);
    return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
    if (!stored) return false;

    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

    try {
        const salt = Buffer.from(parts[1], 'base64');
        const expected = Buffer.from(parts[2], 'base64');
        const derived = await scrypt(password.normalize('NFKC'), salt, expected.length);
        return derived.length === expected.length && timingSafeEqual(derived, expected);
    } catch {
        return false;
    }
}

// ---------------------------------------------------------
// Tokens opacos (sessão, convite, redefinição, confirmação)
//
// O token vai para o usuário; no banco guardamos só o HMAC dele, para que
// um vazamento do banco não permita assumir sessões.
// ---------------------------------------------------------

export function generateToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
}

const REJECTED_AUTH_SECRETS = new Set([
    'spm-dev-secret',
    'troque-este-valor-em-producao-com-48-bytes-aleatorios',
    'desenvolvimento-local-nao-use-em-producao-troque-este-segredo',
]);

function authSecret(): string {
    const secret = env.authSecret;
    if (Buffer.byteLength(secret, 'utf8') < 32 || REJECTED_AUTH_SECRETS.has(secret)) {
        throw new Error(
            'AUTH_SECRET ausente, previsível ou curto: gere um segredo aleatório com pelo menos 32 bytes.',
        );
    }
    return secret;
}

export function hashToken(token: string): string {
    return createHmac('sha256', authSecret()).update(token).digest('hex');
}

// ---------------------------------------------------------
// Dados pessoais em repouso — AES-256-GCM
//
// Usado no módulo de atendimentos. O formato guardado é
// `v1.<iv base64url>.<tag base64url>.<cifra base64url>`.
// ---------------------------------------------------------

const ENCRYPTION_PREFIX = 'v1';
const REJECTED_ENCRYPTION_KEYS = new Set([
    // Base64 do placeholder hexadecimal usado em versões iniciais do projeto.
    'MDAwMTAyMDMwNDA1MDYwNzA4MDkwYTBiMGMwZDBlMGY=',
]);

function encryptionKey(): Buffer | null {
    if (!env.encryptionKey || REJECTED_ENCRYPTION_KEYS.has(env.encryptionKey)) return null;
    try {
        const key = Buffer.from(env.encryptionKey, 'base64');
        return key.length === 32 ? key : null;
    } catch {
        return null;
    }
}

/** Retorna null quando o valor é vazio; lança se a chave não estiver configurada. */
export function encryptSensitive(plain: string | null | undefined): string | null {
    if (plain === null || plain === undefined || plain === '') return null;

    const key = encryptionKey();
    if (!key) {
        throw new Error(
            'ENCRYPTION_KEY ausente ou inválida: são necessários 32 bytes em base64 para cifrar dados pessoais.',
        );
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
        ENCRYPTION_PREFIX,
        iv.toString('base64url'),
        tag.toString('base64url'),
        encrypted.toString('base64url'),
    ].join('.');
}

/**
 * Decifra um valor. Devolve null se o dado estiver ausente, corrompido ou se a
 * chave atual não for a que cifrou — nunca lança, para não derrubar uma tela
 * inteira por causa de um registro problemático.
 */
export function decryptSensitive(payload: string | null | undefined): string | null {
    if (!payload) return null;

    const key = encryptionKey();
    if (!key) return null;

    const parts = payload.split('.');
    if (parts.length !== 4 || parts[0] !== ENCRYPTION_PREFIX) return null;

    try {
        const iv = Buffer.from(parts[1], 'base64url');
        const tag = Buffer.from(parts[2], 'base64url');
        const data = Buffer.from(parts[3], 'base64url');

        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

/**
 * Compatibilidade temporária para registros criados antes da cifra em repouso.
 * O marcador vem do banco; nunca tentamos adivinhar pelo conteúdo. A rotina de
 * retenção converte esses registros em lotes e elimina este caminho legado.
 */
export function decryptSensitiveOrLegacy(
    payload: string | null | undefined,
    encryptedAt: Date | null,
): string | null {
    if (!payload) return null;
    return encryptedAt ? decryptSensitive(payload) : payload;
}

/** Máscara para exibir um dado cifrado sem revelá-lo por inteiro. */
export function maskSensitive(value: string | null): string {
    if (!value) return '—';
    const trimmed = value.trim();
    if (trimmed.length <= 2) return '••';
    return `${trimmed.slice(0, 1)}${'•'.repeat(Math.min(trimmed.length - 2, 8))}${trimmed.slice(-1)}`;
}
