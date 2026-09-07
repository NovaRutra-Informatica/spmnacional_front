import 'server-only';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from './env';
import { getGoogleAccessToken, GOOGLE_SCOPES } from './google-auth';
import { ActionInputError } from './actions';

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
    // O bucket permanece privado também em produção. A rota da aplicação
    // decide se o arquivo já está publicado ou se exige sessão administrativa.
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

export interface StoredFileBody {
    body: Uint8Array | ReadableStream<Uint8Array>;
    contentLength: string | null;
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

async function readGcsFile(storageKey: string): Promise<StoredFileBody | null> {
    if (!env.storage.gcsBucket) return null;

    const token = await getGoogleAccessToken([GOOGLE_SCOPES.storageReadWrite]);
    if (!token) return null;

    const response = await fetch(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(env.storage.gcsBucket)}/o/${encodeURIComponent(storageKey)}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );

    if (!response.ok || !response.body) return null;

    return {
        body: response.body,
        contentLength: response.headers.get('content-length'),
    };
}

/** Lê um objeto sem torná-lo público no provedor de armazenamento. */
export async function readStoredFile(storageKey: string): Promise<StoredFileBody | null> {
    if (env.storage.driver === 'gcs') {
        return readGcsFile(storageKey);
    }

    const file = await readLocalFile(storageKey);
    if (!file) return null;
    return {
        body: new Uint8Array(file.data),
        contentLength: String(file.data.length),
    };
}

// ---------------------------------------------------------
// API pública
// ---------------------------------------------------------

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface UploadType {
    mimeType: string;
    matches: (data: Buffer) => boolean;
}

const startsWith = (signature: number[]) => (data: Buffer) =>
    data.length >= signature.length && signature.every((byte, index) => data[index] === byte);

const isZip = (data: Buffer) =>
    startsWith([0x50, 0x4b, 0x03, 0x04])(data) ||
    startsWith([0x50, 0x4b, 0x05, 0x06])(data) ||
    startsWith([0x50, 0x4b, 0x07, 0x08])(data);

const isOle = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const UPLOAD_TYPES: Record<string, UploadType> = {
    '.png': { mimeType: 'image/png', matches: startsWith([0x89, 0x50, 0x4e, 0x47]) },
    '.jpg': { mimeType: 'image/jpeg', matches: startsWith([0xff, 0xd8, 0xff]) },
    '.jpeg': { mimeType: 'image/jpeg', matches: startsWith([0xff, 0xd8, 0xff]) },
    '.webp': {
        mimeType: 'image/webp',
        matches: (data) =>
            data.length >= 12 &&
            data.subarray(0, 4).toString('ascii') === 'RIFF' &&
            data.subarray(8, 12).toString('ascii') === 'WEBP',
    },
    '.gif': {
        mimeType: 'image/gif',
        matches: (data) => ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii')),
    },
    '.pdf': {
        mimeType: 'application/pdf',
        matches: (data) => data.subarray(0, 5).toString('ascii') === '%PDF-',
    },
    '.zip': { mimeType: 'application/zip', matches: isZip },
    '.docx': {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        matches: isZip,
    },
    '.xlsx': {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        matches: isZip,
    },
    '.doc': { mimeType: 'application/msword', matches: isOle },
    '.xls': { mimeType: 'application/vnd.ms-excel', matches: isOle },
};

export const ALLOWED_MIME_TYPES = new Set(
    Object.values(UPLOAD_TYPES).map(({ mimeType }) => mimeType),
);

/** Valida e armazena bytes já limitados por uma rota autenticada. */
export async function storeBuffer(
    data: Buffer,
    originalName: string,
    options: { prefix?: string } = {},
): Promise<StoredFile> {
    if (data.length <= 0) {
        throw new ActionInputError('O arquivo está vazio.');
    }

    if (data.length > MAX_UPLOAD_BYTES) {
        throw new ActionInputError('Arquivo maior que o limite de 10 MB.');
    }

    const extension = path.extname(originalName).toLowerCase();
    const type = UPLOAD_TYPES[extension];
    if (!type) {
        throw new ActionInputError(
            'Formato não permitido. Use JPG, PNG, WebP, GIF, PDF, ZIP, DOC, DOCX, XLS ou XLSX.',
        );
    }

    if (!type.matches(data)) {
        throw new ActionInputError('O conteúdo do arquivo não corresponde à extensão informada.');
    }

    const mimeType = type.mimeType;
    const storageKey = buildStorageKey(originalName, options.prefix);

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
