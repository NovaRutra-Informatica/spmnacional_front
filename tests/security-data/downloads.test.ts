import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: vi.fn(),
    permission: vi.fn(),
    find: vi.fn(),
    read: vi.fn(),
    log: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
    getCurrentUser: mocks.user,
    hasPermission: mocks.permission,
}));
vi.mock('@/lib/server/db', () => ({ prisma: { media: { findUnique: mocks.find } } }));
vi.mock('@/lib/server/logger', () => ({ logError: mocks.log }));
vi.mock('@/lib/server/storage', () => ({
    isValidStorageKey: (key: string) => /^[a-z0-9]+\/[a-z.]+$/.test(key),
    readStoredFile: mocks.read,
}));
import { GET } from '@/app/api/arquivos/[...key]/route';

const get = (key = ['uploads', 'foto.png']) =>
    GET(new Request('https://spm.test/api/arquivos/x'), { params: Promise.resolve({ key }) });
const draft = {
    mimeType: 'image/png',
    originalName: 'Relatório 🕊️.png',
    posts: [],
    editais: [],
    documentos: [],
    materiais: [],
};

describe('private file delivery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.find.mockResolvedValue({ ...draft });
        mocks.user.mockResolvedValue(null);
        mocks.permission.mockReturnValue(false);
        mocks.read.mockResolvedValue({ body: new Uint8Array([1, 2]), contentLength: '2' });
    });

    it('refuses traversal before querying the database', async () => {
        expect((await get(['..', 'secret'])).status).toBe(404);
        expect(mocks.find).not.toHaveBeenCalled();
    });

    it('keeps unpublished assets inaccessible to anonymous and unrelated roles', async () => {
        expect((await get()).status).toBe(404);
        mocks.user.mockResolvedValue({ id: 'user' });
        expect((await get()).status).toBe(404);
        expect(mocks.read).not.toHaveBeenCalled();
    });

    it('allows permitted editors without exposing the result to shared caches', async () => {
        mocks.user.mockResolvedValue({ id: 'editor' });
        mocks.permission.mockReturnValue(true);
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('private, no-store');
        expect(response.headers.get('content-disposition')).toContain(
            "filename*=UTF-8''Relat%C3%B3rio",
        );
        expect(response.headers.get('content-security-policy')).toContain('sandbox');
    });

    it('serves published assets but rechecks authorization after unpublishing', async () => {
        mocks.find.mockResolvedValueOnce({ ...draft, posts: [{ id: 'published' }] });
        const publicResponse = await get();
        expect(publicResponse.status).toBe(200);
        expect(publicResponse.headers.get('cache-control')).toContain('no-store');
        expect(mocks.user).not.toHaveBeenCalled();
        expect((await get()).status).toBe(404);
    });

    it('does not inline arbitrary image/active content from legacy metadata', async () => {
        mocks.find.mockResolvedValue({ ...draft, mimeType: 'image/svg+xml', posts: [{ id: 'p' }] });
        expect((await get()).headers.get('content-disposition')).toMatch(/^attachment;/);
    });

    it('distinguishes missing objects from provider outages with safe responses', async () => {
        mocks.find.mockResolvedValue({ ...draft, posts: [{ id: 'p' }] });
        mocks.read.mockResolvedValueOnce(null);
        expect((await get()).status).toBe(404);
        mocks.read.mockRejectedValueOnce(new Error('private bucket details'));
        const unavailable = await get();
        expect(unavailable.status).toBe(503);
        expect(await unavailable.text()).not.toContain('bucket');
    });
});
