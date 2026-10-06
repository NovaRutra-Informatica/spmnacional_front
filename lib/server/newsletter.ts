import 'server-only';
import { prisma } from './db';
import { hashToken } from './crypto';

/** Compare-and-swap: token consumido uma vez, sem apagar um token renovado concorrentemente. */
export async function confirmNewsletterToken(token: string) {
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) return null;
    const tokenHash = hashToken(token);
    return prisma.$transaction(async (tx) => {
        const subscriber = await tx.newsletterSubscriber.findUnique({
            where: { confirmTokenHash: tokenHash },
            select: { id: true, email: true },
        });
        if (!subscriber) return null;
        const consumed = await tx.newsletterSubscriber.updateMany({
            where: {
                id: subscriber.id,
                confirmTokenHash: tokenHash,
                confirmExpiresAt: { gt: new Date() },
                confirmed: false,
                unsubscribedAt: null,
            },
            data: {
                confirmed: true,
                confirmedAt: new Date(),
                confirmTokenHash: null,
                confirmExpiresAt: null,
            },
        });
        return consumed.count === 1 ? subscriber : null;
    });
}
