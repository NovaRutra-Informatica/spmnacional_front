import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: vi.fn(),
    permission: vi.fn(),
    audit: vi.fn(),
    limit: vi.fn(),
    create: vi.fn(),
    reserve: vi.fn(),
    clear: vi.fn(),
    transaction: vi.fn(),
    store: vi.fn(),
    remove: vi.fn(),
    log: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
    getCurrentUser: mocks.user,
    hasPermission: mocks.permission,
}));
vi.mock('@/lib/server/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.limit }));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        mediaDeletion: { create: mocks.reserve },
        $transaction: mocks.transaction,
    },
}));
vi.mock('@/lib/server/env', () => ({ env: { appUrl: 'https://spm.test' } }));
vi.mock('@/lib/server/logger', () => ({ logError: mocks.log }));
vi.mock('@/lib/server/storage', () => ({
    MAX_UPLOAD_BYTES: 10,
    deleteFile: mocks.remove,
    storeBuffer: mocks.store,
}));
vi.mock('@/lib/server/actions', () => ({ ActionInputError: class extends Error {} }));
import { POST } from '@/app/api/admin/uploads/route';

function request(
    options: { origin?: string; purpose?: string; filename?: string; body?: BodyInit | null } = {},
) {
    return new Request(
        `https://spm.test/api/admin/uploads?purpose=${options.purpose ?? 'biblioteca'}`,
        {
            method: 'POST',
            headers: {
                origin: options.origin ?? 'https://spm.test',
                'x-file-name': encodeURIComponent(options.filename ?? 'foto.png'),
            },
            body: options.body === undefined ? new Uint8Array([1, 2, 3]) : options.body,
            duplex: 'half',
        } as RequestInit,
    );
}

describe('authenticated upload route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: 'user', email: 'staff@spm.test' });
        mocks.permission.mockReturnValue(true);
        mocks.limit.mockResolvedValue({ allowed: true });
        const file = {
            storageKey: 'uploads/photo.png',
            filename: 'photo.png',
            mimeType: 'image/png',
            url: '/api/arquivos/uploads/photo.png',
            size: 3,
        };
        mocks.store.mockImplementation(async (_bytes, _filename, options) => {
            await options.beforeStore(file);
            return file;
        });
        mocks.reserve.mockResolvedValue({ id: 'recovery-job' });
        mocks.clear.mockResolvedValue({ count: 1 });
        mocks.transaction.mockImplementation(async (fn) =>
            fn({
                media: { create: mocks.create },
                mediaDeletion: { deleteMany: mocks.clear },
            }),
        );
        mocks.create.mockResolvedValue({ id: 'media' });
        mocks.remove.mockResolvedValue(undefined);
        mocks.audit.mockResolvedValue(undefined);
    });
    afterEach(() => vi.useRealTimers());

    it('rejects foreign origins before reading a session or a body', async () => {
        expect((await POST(request({ origin: 'https://attacker.test' }))).status).toBe(403);
        expect(mocks.user).not.toHaveBeenCalled();
        expect(mocks.store).not.toHaveBeenCalled();
    });

    it.each(['__proto__', 'constructor', 'invalid'])(
        'refuses prototype/unknown upload purpose %s',
        async (purpose) => {
            expect((await POST(request({ purpose }))).status).toBe(400);
            expect(mocks.user).not.toHaveBeenCalled();
        },
    );

    it('requires authentication, permission and upload budget', async () => {
        mocks.user.mockResolvedValueOnce(null);
        expect((await POST(request())).status).toBe(401);
        mocks.permission.mockReturnValueOnce(false);
        expect((await POST(request())).status).toBe(403);
        mocks.limit.mockResolvedValue({ allowed: false });
        expect((await POST(request())).status).toBe(429);
        expect(mocks.store).not.toHaveBeenCalled();
    });

    it('rejects path filenames and invalid news cover extensions', async () => {
        expect((await POST(request({ filename: '../outside.png' }))).status).toBe(400);
        expect((await POST(request({ purpose: 'noticias', filename: 'file.pdf' }))).status).toBe(
            400,
        );
        expect(mocks.store).not.toHaveBeenCalled();
    });

    it('enforces streamed body length, empty body and timeout', async () => {
        expect((await POST(request({ body: new Uint8Array(11) }))).status).toBe(400);
        expect((await POST(request({ body: null }))).status).toBe(400);
        vi.useFakeTimers();
        const pending = POST(request({ body: new ReadableStream() }));
        await vi.advanceTimersByTimeAsync(30_001);
        expect((await pending).status).toBe(400);
        expect(mocks.store).not.toHaveBeenCalled();
    });

    it('persists metadata and preserves the stored file after a successful insert', async () => {
        const response = await POST(request());
        expect(response.status).toBe(201);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(mocks.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ uploadedById: 'user', kind: 'IMAGEM' }),
            }),
        );
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.reserve).toHaveBeenCalledWith({
            data: { storageKey: 'uploads/photo.png', nextAttemptAt: expect.any(Date) },
            select: { id: true },
        });
        expect(mocks.reserve.mock.calls[0][0].data.nextAttemptAt.getTime()).toBeGreaterThan(
            Date.now() + 14 * 60_000,
        );
        expect(mocks.clear).toHaveBeenCalledWith({
            where: {
                id: 'recovery-job',
                storageKey: 'uploads/photo.png',
                attempts: 0,
                leaseToken: null,
            },
        });
    });

    it('keeps durable orphan recovery when metadata fails, without racing an immediate DELETE', async () => {
        mocks.create.mockRejectedValueOnce(new Error('database private details'));
        const response = await POST(request());
        expect(response.status).toBe(500);
        expect(mocks.reserve).toHaveBeenCalledOnce();
        expect(mocks.clear).not.toHaveBeenCalled();
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(await response.text()).not.toContain('details');
        expect(mocks.log).toHaveBeenCalledWith('upload.failed', expect.any(Error));
    });

    it('does not start storage persistence if recovery cannot be recorded', async () => {
        mocks.reserve.mockRejectedValueOnce(new Error('SQL unavailable'));
        expect((await POST(request())).status).toBe(500);
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('refuses to commit metadata if a recovery lease was acquired unexpectedly', async () => {
        mocks.clear.mockResolvedValueOnce({ count: 0 });
        expect((await POST(request())).status).toBe(500);
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });

    it('retains the job after an ambiguous provider timeout', async () => {
        mocks.store.mockImplementationOnce(async (_bytes, _filename, options) => {
            await options.beforeStore({ storageKey: 'uploads/photo.png', mimeType: 'image/png' });
            throw new Error('provider timeout');
        });
        expect((await POST(request())).status).toBe(500);
        expect(mocks.reserve).toHaveBeenCalledOnce();
        expect(mocks.clear).not.toHaveBeenCalled();
        expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('does not delete a committed file if a later audit unexpectedly fails', async () => {
        mocks.audit.mockRejectedValueOnce(new Error('audit failed'));
        expect((await POST(request())).status).toBe(500);
        expect(mocks.remove).not.toHaveBeenCalled();
    });
});
