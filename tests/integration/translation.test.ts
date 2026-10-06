import { afterAll, describe, expect, it } from 'vitest';
import './guard';
import { prisma } from '../../lib/server/db';
import {
    claimTranslation,
    completeTranslation,
    readTranslation,
    releaseTranslation,
    reserveTranslationCharacters,
    translationId,
} from '../../lib/server/translation-store';

afterAll(async () => prisma.$disconnect());

describe('leases e orçamento de tradução no PostgreSQL isolado', () => {
    it('50 leitores concorrentes elegem exatamente um tradutor por versão/idioma', async () => {
        const sourceHash = 'a'.repeat(64);
        const input = {
            id: translationId('post:test-race', sourceHash, 'en'),
            key: 'post:test-race',
            sourceHash,
            locale: 'en' as const,
        };
        const claims = await Promise.all(Array.from({ length: 50 }, () => claimTranslation(input)));
        const owners = claims.filter((claim) => claim !== null);
        expect(owners).toHaveLength(1);
        expect(await completeTranslation(input.id, 'not-owner', { title: 'Invalid' })).toBe(false);
        expect(await completeTranslation(input.id, owners[0]!.token, { title: 'Hello' })).toBe(
            true,
        );
        expect(await readTranslation(input.id)).toEqual({ title: 'Hello' });
        expect(await claimTranslation(input)).toBeNull();
    });
    it('versão alterada e idioma diferente não reutilizam tradução antiga', async () => {
        const old = translationId('post:version-test', 'a'.repeat(64), 'en');
        const next = translationId('post:version-test', 'b'.repeat(64), 'en');
        expect(next).not.toBe(old);
        expect(translationId('post:version-test', 'b'.repeat(64), 'ar')).not.toBe(next);
        expect(await readTranslation(next)).toBeUndefined();
    });
    it('worker abandonado pode ser substituído, mas não sobrescreve o novo dono', async () => {
        const sourceHash = 'c'.repeat(64);
        const input = {
            id: translationId('post:expired', sourceHash, 'fr'),
            key: 'post:expired',
            sourceHash,
            locale: 'fr' as const,
        };
        const first = await claimTranslation(input);
        await prisma.publicTranslation.update({
            where: { id: input.id },
            data: { leaseUntil: new Date(0) },
        });
        const next = await claimTranslation(input);
        expect(next?.token).not.toBe(first!.token);
        expect(await completeTranslation(input.id, first!.token, { title: 'Stale' })).toBe(false);
        await releaseTranslation(input.id, first!.token, 60);
        expect(
            (await prisma.publicTranslation.findUniqueOrThrow({ where: { id: input.id } }))
                .leaseToken,
        ).toBe(next!.token);
        await releaseTranslation(input.id, next!.token, 60);
        expect(await claimTranslation(input)).toBeNull();
    });
    it('reservas simultâneas nunca ultrapassam orçamento e recusam pedido maior que limite', async () => {
        // A base isolada é criada do zero por scripts/test-isolated.mjs.
        expect(await reserveTranslationCharacters(101, 100)).toBe(false);
        const reservations = await Promise.all(
            Array.from({ length: 50 }, () => reserveTranslationCharacters(10, 100)),
        );
        expect(reservations.filter(Boolean)).toHaveLength(10);
        const usage = await prisma.translationUsage.findMany();
        expect(usage).toHaveLength(1);
        expect(usage[0].characters).toBe(100);
        expect(usage[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(await reserveTranslationCharacters(1, 0)).toBe(false);
    });
});
