import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const config = vi.hoisted(() => ({
    storage: { driver: 'local', localDir: '', gcsBucket: 'test-private-bucket' },
}));
const token = vi.hoisted(() => vi.fn(async () => 'test-token'));
vi.mock('@/lib/server/env', () => ({ env: config }));
vi.mock('@/lib/server/google-auth', () => ({
    getGoogleAccessToken: token,
    GOOGLE_SCOPES: { storageReadWrite: 'storage-scope' },
}));
vi.mock('@/lib/server/actions', () => ({ ActionInputError: class extends Error {} }));
import {
    buildStorageKey,
    deleteFile,
    guessMimeType,
    isValidStorageKey,
    MAX_UPLOAD_BYTES,
    publicUrlFor,
    readLocalFile,
    readStoredFile,
    storeBuffer,
} from '@/lib/server/storage';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('private storage', () => {
    let scratch: string;
    beforeEach(async () => {
        scratch = await mkdtemp(path.join(tmpdir(), 'spm-storage-test-'));
        config.storage.localDir = path.join(scratch, 'uploads');
        config.storage.driver = 'local';
        token.mockResolvedValue('test-token');
    });
    afterEach(async () => {
        vi.unstubAllGlobals();
        await rm(scratch, { recursive: true, force: true });
    });

    it.each([
        '../secret',
        '/absolute',
        'folder/../secret',
        'a\\b',
        'a//b',
        'a/./b',
        'a/%2e%2e/b',
        'a/file?x=1',
        'a\u0000b',
        'C:/secret',
        '',
    ])('refuses ambiguous/traversal key %s', async (key) => {
        expect(isValidStorageKey(key)).toBe(false);
        expect(() => publicUrlFor(key)).toThrow();
        await expect(deleteFile(key)).rejects.toThrow();
    });

    it('builds canonical keys with full UUID entropy and rejects malicious prefixes', () => {
        const key = buildStorageKey('Relatório Àção.PNG', 'biblioteca');
        expect(key).toMatch(/^biblioteca\/\d{4}\/\d{2}\/[a-f0-9-]{36}-relatorio-acao\.png$/);
        expect(isValidStorageKey(key)).toBe(true);
        expect(() => buildStorageKey('ok.png', '../outside')).toThrow();
        expect(guessMimeType('doc.PDF')).toBe('application/pdf');
        expect(guessMimeType('x.bin')).toBe('application/octet-stream');
        for (const unsafe of ['uploads/CON', 'uploads/aux.pdf', 'uploads/name.', 'NUL/file.pdf']) {
            expect(isValidStorageKey(unsafe)).toBe(false);
        }
    });

    it('round trips without loading each HTTP download wholly into memory', async () => {
        const stored = await storeBuffer(png, 'foto.png');
        expect(stored.mimeType).toBe('image/png');
        expect((await readLocalFile(stored.storageKey))?.data).toEqual(png);
        const result = await readStoredFile(stored.storageKey);
        expect(result?.contentLength).toBe(String(png.length));
        expect(Buffer.from(await new Response(result!.body as BodyInit).arrayBuffer())).toEqual(
            png,
        );
        await deleteFile(stored.storageKey);
        expect(await readStoredFile(stored.storageKey)).toBeNull();
        await expect(deleteFile(stored.storageKey)).resolves.toBeUndefined();
    });

    it('rejects empty, oversized, active and disguised contents', async () => {
        await expect(storeBuffer(Buffer.alloc(0), 'x.png')).rejects.toThrow();
        await expect(storeBuffer(Buffer.alloc(MAX_UPLOAD_BYTES + 1), 'x.png')).rejects.toThrow();
        await expect(storeBuffer(Buffer.from('<svg/>'), 'x.svg')).rejects.toThrow();
        await expect(storeBuffer(Buffer.from('HTML'), 'x.png')).rejects.toThrow();
        await expect(storeBuffer(png.subarray(0, 4), 'x.png')).rejects.toThrow();
    });

    it('rejects directory symlinks/junctions rather than writing outside the volume', async () => {
        await mkdir(config.storage.localDir, { recursive: true });
        const outside = path.join(scratch, 'outside');
        await mkdir(outside);
        await writeFile(path.join(outside, 'secret.pdf'), '%PDF-secret');
        await symlink(
            outside,
            path.join(config.storage.localDir, 'evil'),
            process.platform === 'win32' ? 'junction' : 'dir',
        );
        await expect(storeBuffer(png, 'x.png', { prefix: 'evil' })).rejects.toThrow();
        await expect(readStoredFile('evil/secret.pdf')).rejects.toThrow();
        await expect(deleteFile('evil/secret.pdf')).rejects.toThrow();
        expect(await readFile(path.join(outside, 'secret.pdf'), 'utf8')).toBe('%PDF-secret');
    });

    it('uses create-only GCS requests with bounded time and no credential-forwarding redirect', async () => {
        config.storage.driver = 'gcs';
        const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        await storeBuffer(png, 'foto.png');
        const [url, options] = fetch.mock.calls[0];
        expect(new URL(url).searchParams.get('ifGenerationMatch')).toBe('0');
        expect(options.redirect).toBe('error');
        expect(options.signal).toBeInstanceOf(AbortSignal);
        fetch.mockResolvedValueOnce(new Response('', { status: 403 }));
        await expect(deleteFile('uploads/photo.png')).rejects.toThrow();
        fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
        await expect(deleteFile('uploads/photo.png')).resolves.toBeUndefined();
    });

    it('awaits recovery persistence before writing any bytes to a provider', async () => {
        config.storage.driver = 'gcs';
        const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        const beforeStore = vi.fn(async (file) => {
            expect(fetch).not.toHaveBeenCalled();
            expect(Object.isFrozen(file)).toBe(true);
            expect(file.storageKey).toMatch(/^uploads\//);
            throw new Error('recovery database unavailable');
        });
        await expect(storeBuffer(png, 'foto.png', { beforeStore })).rejects.toThrow(
            'recovery database unavailable',
        );
        expect(beforeStore).toHaveBeenCalledOnce();
        expect(fetch).not.toHaveBeenCalled();
        const invalid = vi.fn();
        await expect(
            storeBuffer(Buffer.from('HTML'), 'foto.png', { beforeStore: invalid }),
        ).rejects.toThrow();
        expect(invalid).not.toHaveBeenCalled();
    });

    it('streams private GCS objects and distinguishes provider failures from absence', async () => {
        config.storage.driver = 'gcs';
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(png, { headers: { 'content-length': String(png.length) } }),
            );
        vi.stubGlobal('fetch', fetch);
        const file = await readStoredFile('uploads/foto.png');
        expect(Buffer.from(await new Response(file!.body as BodyInit).arrayBuffer())).toEqual(png);
        fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
        expect(await readStoredFile('uploads/missing.png')).toBeNull();
        fetch.mockResolvedValueOnce(new Response('', { status: 503 }));
        await expect(readStoredFile('uploads/foto.png')).rejects.toThrow();
        fetch.mockResolvedValueOnce(
            new Response(png, { headers: { 'content-length': String(MAX_UPLOAD_BYTES + 1) } }),
        );
        await expect(readStoredFile('uploads/foto.png')).rejects.toThrow();
        token.mockResolvedValueOnce('');
        await expect(readStoredFile('uploads/foto.png')).rejects.toThrow();
    });

    it.each([
        ['photo.jpg', Buffer.from([0xff, 0xd8, 0xff])],
        ['photo.webp', Buffer.from('RIFF0000WEBP')],
        ['photo.gif', Buffer.from('GIF89a')],
        ['document.pdf', Buffer.from('%PDF-1.7')],
        ['archive.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
        ['document.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
        ['document.xls', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ])(
        'retains supported format signature %s (not an antivirus verdict)',
        async (filename, data) => {
            expect((await storeBuffer(data, filename)).size).toBe(data.length);
        },
    );
});
