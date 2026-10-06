import { beforeEach, describe, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
    newsletterSubscriber: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('../../lib/server/db', () => ({
    prisma: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) },
}));
import { confirmNewsletterToken } from '../../lib/server/newsletter';
beforeEach(() => vi.clearAllMocks());
describe('consumo atômico de confirmação', () => {
    it('ignora token malformado antes do banco', async () => {
        expect(await confirmNewsletterToken('bad')).toBeNull();
        expect(tx.newsletterSubscriber.findUnique).not.toHaveBeenCalled();
    });
    it('retorna null se não encontrado ou consumido concorrentemente', async () => {
        tx.newsletterSubscriber.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'id', email: 'test@example.test' });
        tx.newsletterSubscriber.updateMany.mockResolvedValue({ count: 0 });
        expect(await confirmNewsletterToken('a'.repeat(43))).toBeNull();
        expect(await confirmNewsletterToken('a'.repeat(43))).toBeNull();
    });
    it('update exige mesmo hash, validade, pendência e não cancelamento', async () => {
        const subscriber = { id: 'id', email: 'test@example.test' };
        tx.newsletterSubscriber.findUnique.mockResolvedValue(subscriber);
        tx.newsletterSubscriber.updateMany.mockResolvedValue({ count: 1 });
        expect(await confirmNewsletterToken('a'.repeat(43))).toEqual(subscriber);
        expect(tx.newsletterSubscriber.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: 'id',
                    confirmed: false,
                    unsubscribedAt: null,
                    confirmExpiresAt: { gt: expect.any(Date) },
                    confirmTokenHash: expect.any(String),
                }),
            }),
        );
    });
});
