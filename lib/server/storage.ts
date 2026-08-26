import 'server-only';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from './env';
import { getGoogleAccessToken, GOOGLE_SCOPES } from './google-auth';

/**
 * Armazenamento de arquivos com dois provedores:
 *
 * - `local`: grava em disco. Bom para desenvolvimento e para rodar numa VPS
 *   com volume montado. Os arquivos são servidos por /api/arquivos/[...key].
 * - `gcs`: grava no Cloud Storage pela API REST, autenticando com a conta de
 *   serviço do Cloud Run. Sem SDK.
 */

export interface StoredFile {
    storageKey: string;
    url: string;
    filename: string;
    size: number;
    mimeType: string;
}

const SAFE_CHARS = /[^a-zA-Z0-9._-]+/g;
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Nome de arquivo previsível e seguro, preservando a extensão original. */
export function buildStorageKey(originalName: string, prefix = 'uploads'): string {
    const ext = path.extname(originalName).toLowerCase().slice(0, 12);
    const base = path
        .basename(originalName, path.extname(originalName))
        .normalize('NFD')
        .replace(DIACRITICS, '')
        .replace(SAFE_CHARS, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
        .slice(0, 60);

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

    return `${prefix}/${yyyy}/${mm}/${randomUUID().slice(0, 8)}-${base || 'arquivo'}${ext}`;
}

export function publicUrlFor(storageKey: string): string {
    if (env.storage.driver === 'gcs') {
        const base =
            env.storage.gcsPublicBaseUrl ||
            `https://storage.googleapis.com/${env.storage.gcsBucket}`;
        return `${base.replace(/\/$/, '')}/${storageKey}`;
    }
    return `/api/arquivos/${storageKey}`;
}

// ---------------------------------------------------------
// Provedor local
// ---------------------------------------------------------

function localPathFor(storageKey: string): string {
    const root = path.resolve(env.storage.localDir);
    const target = path.resolve(root, storageKey);

    // Barra travessia de diretório vinda de uma chave manipulada.
    if (!target.startsWith(root + path.sep) && target !== root) {
        throw new Error('Chave de arquivo inválida.');
    }
    return target;
}

async function putLocal(storageKey: string, data: Buffer): Promise<void> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const target = localPathFor(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
}

async function deleteLocal(storageKey: string): Promise<void> {
    const { unlink } = await import('node:fs/promises');
    try {
        await unlink(localPathFor(storageKey));
    } catch {
        // Arquivo já ausente: não é erro para quem chamou.
    }
}

export async function readLocalFile(
    storageKey: string,
): Promise<{ data: Buffer; mimeType: string } | null> {
    if (env.storage.driver !== 'local') return null;

    try {
        const { readFile } = await import('node:fs/promises');
        const target = localPathFor(storageKey);
        const data = await readFile(target);
        return { data, mimeType: guessMimeType(target) };
    } catch {
        return null;
    }
}

const MIME_BY_EXT: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function guessMimeType(filename: string): string {
    return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}

// ---------------------------------------------------------
// Provedor Cloud Storage (REST)
// ---------------------------------------------------------

async function putGcs(storageKey: string, data: Buffer, mimeType: string): Promise<void> {
    if (!env.storage.gcsBucket) {
        throw new Error('GCS_BUCKET não configurado.');
    }

    const token = await getGoogleAccessToken([GOOGLE_SCOPES.storageReadWrite]);
    if (!token) {
        throw new Error(
            'Sem credencial do Google. No Cloud Run isso vem da conta de serviço; fora dele, defina GOOGLE_APPLICATION_CREDENTIALS.',
        );
    }

    const url = new URL(
        `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(env.storage.gcsBucket)}/o`,
    );
    url.searchParams.set('uploadType', 'media');
    url.searchParams.set('name', storageKey);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': mimeType,
        },
        body: new Uint8Array(data),
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`Falha ao enviar para o Cloud Storage (${response.status}).`);
    }
}

async function deleteGcs(storageKey: string): Promise<void> {
    if (!env.storage.gcsBucket) return;

    const token = await getGoogleAccessToken([GOOGLE_SCOPES.storageReadWrite]);
    if (!token) return;

    await fetch(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(env.storage.gcsBucket)}/o/${encodeURIComponent(storageKey)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    ).catch(() => undefined);
}

// ---------------------------------------------------------
// API pública
// ---------------------------------------------------------

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export async function storeFile(
    file: File,
    options: { prefix?: string } = {},
): Promise<StoredFile> {
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('Arquivo maior que o limite de 20 MB.');
    }

    const mimeType = file.type || guessMimeType(file.name);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new Error(`Tipo de arquivo não permitido: ${mimeType}`);
    }

    const storageKey = buildStorageKey(file.name, options.prefix);
    const data = Buffer.from(await file.arrayBuffer());

    if (env.storage.driver === 'gcs') {
        await putGcs(storageKey, data, mimeType);
    } else {
        await putLocal(storageKey, data);
    }

    return {
        storageKey,
        url: publicUrlFor(storageKey),
        filename: path.basename(storageKey),
        size: data.length,
        mimeType,
    };
}

export async function deleteFile(storageKey: string): Promise<void> {
    if (env.storage.driver === 'gcs') {
        await deleteGcs(storageKey);
    } else {
        await deleteLocal(storageKey);
    }
}
