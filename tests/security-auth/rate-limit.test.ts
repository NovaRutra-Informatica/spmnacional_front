import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/db', () => ({ prisma: { $queryRaw: query } }));
vi.mock('@/lib/server/crypto', () => ({ hashToken: () => 'opaque-hash' }));
import { consumeRateLimit } from '@/lib/server/rate-limit';

const options = { scope: 'login', identifier: 'private@example.test', limit: 3, windowMs: 60000 };
beforeEach(() => vi.clearAllMocks());
describe('limitador compartilhado entre instâncias', () => {
    it('retorna saldo e Retry-After sem gravar identificador em claro', async () => {
        query.mockResolvedValue([{ count: 2, expiresAt: new Date(Date.now() + 55000) }]);
        const result = await consumeRateLimit(options);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(1);
        expect(result.retryAfterSeconds).toBeGreaterThan(0);
        expect(JSON.stringify(query.mock.calls)).not.toContain(options.identifier);
        expect(query.mock.calls[0][0].join('')).toContain('ON CONFLICT');
        expect(query.mock.calls[0][0].join('')).toContain('LEAST');
    });
    it('bloqueia excesso e falha fechado quando o banco não responde', async () => {
        query.mockResolvedValue([{ count: 4, expiresAt: new Date(Date.now() + 60000) }]);
        expect(await consumeRateLimit(options)).toMatchObject({ allowed: false, remaining: 0 });
        query.mockResolvedValue([]);
        expect(await consumeRateLimit(options)).toMatchObject({ allowed: false, remaining: 0 });
        query.mockRejectedValue(new Error('database unavailable'));
        await expect(consumeRateLimit(options)).rejects.toThrow();
    });
    it.each([0, -1, 1.5, NaN, Infinity])('rejeita limite inválido %s', async (limit) => {
        await expect(consumeRateLimit({ ...options, limit })).rejects.toThrow(RangeError);
        expect(query).not.toHaveBeenCalled();
    });
});
