import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ adapter: vi.fn(), client: vi.fn(), count: vi.fn().mockResolvedValue(0) }));
vi.mock('@prisma/adapter-pg', () => ({
    PrismaPg: class {
        constructor(options: unknown) {
            mocks.adapter(options);
        }
    },
}));
vi.mock('@/lib/generated/prisma/client', () => ({
    Prisma: { ModelName: { Post: 'Post' } },
    PrismaClient: class {
        post = { count: mocks.count };
        constructor(options: unknown) {
            mocks.client(options);
        }
    },
}));
vi.mock('../../lib/server/env', () => ({
    env: {
        databaseUrl: 'postgresql://fixture:fixture@127.0.0.1:65432/fixture',
        database: { poolMax: 5, connectionTimeoutMs: 5000, queryTimeoutMs: 10000 },
    },
}));

const shared = globalThis as unknown as { prisma?: unknown };
const original = shared.prisma;
afterEach(() => {
    if (original === undefined) delete shared.prisma;
    else shared.prisma = original;
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
});

describe('pool Prisma único por processo', () => {
    it.each(['production', 'development', 'test'])(
        'reutiliza cliente e adapter entre carregamentos em %s',
        async (mode) => {
            delete shared.prisma;
            vi.stubEnv('NODE_ENV', mode);
            vi.resetModules();
            const first = await import('../../lib/server/db');
            vi.resetModules();
            const second = await import('../../lib/server/db');

            // Each module has its current scope facade, but both facades must
            // reuse the same raw client/pool stored for this process.
            expect(first.prisma).not.toBe(shared.prisma);
            expect(second.prisma).not.toBe(shared.prisma);
            await expect(first.prisma.post.count()).resolves.toBe(0);
            await expect(second.prisma.post.count()).resolves.toBe(0);
            expect(mocks.count).toHaveBeenCalledTimes(2);
            expect(mocks.count.mock.contexts).toEqual([
                (shared.prisma as { post: unknown }).post,
                (shared.prisma as { post: unknown }).post,
            ]);
            expect(mocks.client).toHaveBeenCalledTimes(1);
            expect(mocks.adapter).toHaveBeenCalledTimes(1);
            expect(mocks.adapter).toHaveBeenCalledWith(
                expect.objectContaining({ max: 5, application_name: 'spm-site' }),
            );
        },
    );
});
