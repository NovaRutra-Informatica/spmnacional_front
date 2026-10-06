import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), query: vi.fn(), execute: vi.fn() }));
vi.mock('../../lib/server/db', () => ({
    prisma: {
        publicTranslation: { findUnique: mocks.find },
        $queryRaw: mocks.query,
        $executeRaw: mocks.execute,
    },
}));
import {
    claimTranslation,
    completeTranslation,
    readTranslation,
    releaseTranslation,
    reserveTranslationCharacters,
    translationId,
} from '../../lib/server/translation-store';

beforeEach(() => vi.resetAllMocks());

describe('contrato de persistência da tradução', () => {
    it('identidade muda para conteúdo, versão ou idioma diferentes', () => {
        const original = translationId('post:1', 'version1', 'en');
        expect(translationId('post:1', 'version1', 'en')).toBe(original);
        expect(translationId('post:2', 'version1', 'en')).not.toBe(original);
        expect(translationId('post:1', 'version2', 'en')).not.toBe(original);
        expect(translationId('post:1', 'version1', 'ar')).not.toBe(original);
    });
    it('cache lê somente os campos traduzidos', async () => {
        mocks.find.mockResolvedValue({ translatedFields: { title: 'Hello' } });
        expect(await readTranslation('id')).toEqual({ title: 'Hello' });
        expect(mocks.find).toHaveBeenCalledWith({
            where: { id: 'id' },
            select: { translatedFields: true },
        });
        mocks.find.mockResolvedValue(null);
        expect(await readTranslation('absent')).toBeUndefined();
    });
    it('criação é idempotente em todos os índices e aquisição usa relógio do banco', async () => {
        mocks.execute.mockResolvedValue(1);
        mocks.query.mockResolvedValue([{ attempts: 3 }]);
        const result = await claimTranslation({
            id: 'id',
            key: 'post:1',
            sourceHash: 'hash',
            locale: 'en',
        });
        expect(result?.attempts).toBe(3);
        expect(result?.token).toMatch(/^[a-f0-9-]{36}$/);
        expect(mocks.execute.mock.calls[0][0].join('')).toContain('ON CONFLICT DO NOTHING');
        expect(mocks.query.mock.calls[0][0].join('')).toContain(
            '"leaseUntil" <= CURRENT_TIMESTAMP',
        );
        expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.query.mock.invocationCallOrder[0],
        );
        mocks.query.mockResolvedValue([]);
        expect(
            await claimTranslation({ id: 'id', key: 'post:1', sourceHash: 'hash', locale: 'en' }),
        ).toBeNull();
    });
    it.each([
        [0, 10],
        [-1, 10],
        [11, 10],
        [1.5, 10],
        [1, 0],
        [1, Infinity],
        [1, 10_000_001],
    ])('recusa reserva inválida %s/%s sem acessar banco', async (characters, limit) => {
        expect(await reserveTranslationCharacters(characters, limit)).toBe(false);
        expect(mocks.query).not.toHaveBeenCalled();
    });
    it('resultado da reserva reflete a decisão atômica do banco', async () => {
        mocks.query.mockResolvedValue([{ characters: 9 }]);
        expect(await reserveTranslationCharacters(9, 10)).toBe(true);
        mocks.query.mockResolvedValue([]);
        expect(await reserveTranslationCharacters(9, 10)).toBe(false);
    });
    it('completa somente quando ainda é dono de lease válido', async () => {
        mocks.execute.mockResolvedValue(1);
        expect(await completeTranslation('id', 'token', { title: 'Hello' })).toBe(true);
        const query = mocks.execute.mock.calls[0][0].join('');
        expect(query).toContain('"leaseUntil" > CURRENT_TIMESTAMP');
        expect(query).toContain('"leaseToken" =');
        mocks.execute.mockResolvedValue(0);
        expect(await completeTranslation('id', 'old', { title: 'Hello' })).toBe(false);
    });
    it('backoff é limitado e só libera lease do chamador', async () => {
        await releaseTranslation('id', 'token', -1);
        expect(mocks.execute.mock.calls[0].slice(1)).toEqual([60, 'id', 'token']);
        await releaseTranslation('id', 'token', 100000);
        expect(mocks.execute.mock.calls[1].slice(1)).toEqual([86400, 'id', 'token']);
    });
});
