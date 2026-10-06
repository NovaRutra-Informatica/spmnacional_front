import { afterAll, describe, expect, it, vi } from 'vitest';
import './guard';
import { prisma } from '../../lib/server/db';
import { consumeRateLimit } from '../../lib/server/rate-limit';
import {
    generateToken,
    hashToken,
    encryptSensitive,
    decryptSensitive,
} from '../../lib/server/crypto';
import { confirmNewsletterToken } from '../../lib/server/newsletter';
import { getPostBySlug, listPublishedPosts } from '../../lib/server/queries';
import { bootstrapProduction } from '../../scripts/lib/account-provisioning';
import { processMediaDeletion, queueMediaDeletion } from '../../lib/server/media-deletion';

const cookieState = vi.hoisted(() => ({ token: '' }));
vi.mock('next/headers', () => ({
    cookies: async () => ({ get: () => ({ value: cookieState.token }) }),
    headers: async () => new Headers(),
}));
import { getCurrentUser, revokeAllSessions } from '../../lib/server/auth';

afterAll(async () => prisma.$disconnect());
describe('contratos no PostgreSQL real e descartável', () => {
    it('bootstrap mínimo cria perfis/conta e nunca sobrescreve base inicializada', async () => {
        const input = {
            email: 'bootstrap@example.test',
            workspaceDomain: 'example.test',
        };
        const { userId } = await bootstrapProduction(prisma, input);
        expect(await prisma.user.count()).toBe(1);
        expect(await prisma.role.count()).toBe(5);
        expect(await prisma.permission.count()).toBe(6);
        expect(await prisma.post.count()).toBe(0);
        expect(await prisma.regional.count()).toBe(0);
        const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
        await expect(bootstrapProduction(prisma, input)).rejects.toThrow();
        expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash).toBe(
            before.passwordHash,
        );
    });
    it('migrações e filtro editorial não publicam rascunhos nem conteúdo futuro', async () => {
        const category = await prisma.category.create({
            data: { slug: 'test-integration', name: 'Teste integração' },
        });
        for (const [slug, status, date] of [
            ['visivel', 'PUBLICADO', new Date(Date.now() - 60000)],
            ['rascunho', 'RASCUNHO', new Date(Date.now() - 60000)],
            ['futuro', 'PUBLICADO', new Date(Date.now() + 86400000)],
        ] as const) {
            await prisma.post.create({
                data: {
                    slug,
                    title: slug,
                    excerpt: 'Teste',
                    content: 'Teste',
                    categoryId: category.id,
                    authorName: 'Teste',
                    status,
                    publishedAt: date,
                },
            });
        }
        expect((await listPublishedPosts()).map((post) => post.slug)).toEqual(['visivel']);
        expect(await getPostBySlug('rascunho')).toBeNull();
        expect(await getPostBySlug('futuro')).toBeNull();
        expect((await getPostBySlug('visivel'))?.content).toBe('Teste');
    });
    it('limite atômico funciona com requisições concorrentes e não grava e-mail em claro', async () => {
        const results = await Promise.all(
            Array.from({ length: 20 }, () =>
                consumeRateLimit({
                    scope: 'integration',
                    identifier: 'person@example.test',
                    limit: 5,
                    windowMs: 60000,
                }),
            ),
        );
        expect(results.filter((result) => result.allowed)).toHaveLength(5);
        const buckets = await prisma.rateLimitBucket.findMany();
        expect(buckets).toHaveLength(1);
        // O contador satura em limite + 1, evitando overflow sob abuso contínuo.
        expect(buckets[0].count).toBe(6);
        expect(JSON.stringify(buckets)).not.toContain('person@example.test');
        await prisma.rateLimitBucket.update({
            where: { key: buckets[0].key },
            data: { expiresAt: new Date(0) },
        });
        expect(
            (
                await consumeRateLimit({
                    scope: 'integration',
                    identifier: 'person@example.test',
                    limit: 5,
                    windowMs: 60000,
                })
            ).remaining,
        ).toBe(4);
    });
    it('dupla confirmação aceita exatamente uma requisição concorrente', async () => {
        const token = generateToken();
        await prisma.newsletterSubscriber.create({
            data: {
                email: 'confirm@example.test',
                confirmTokenHash: hashToken(token),
                confirmExpiresAt: new Date(Date.now() + 60000),
            },
        });
        const attempts = await Promise.all(
            Array.from({ length: 10 }, () => confirmNewsletterToken(token)),
        );
        expect(attempts.filter(Boolean)).toHaveLength(1);
        const subscriber = await prisma.newsletterSubscriber.findUniqueOrThrow({
            where: { email: 'confirm@example.test' },
        });
        expect(subscriber.confirmed).toBe(true);
        expect(subscriber.confirmTokenHash).toBeNull();
        expect(await confirmNewsletterToken(token)).toBeNull();
    });
    it('token vencido e token renovado não confirmam inscrição', async () => {
        const old = generateToken();
        const next = generateToken();
        const subscriber = await prisma.newsletterSubscriber.create({
            data: {
                email: 'expired@example.test',
                confirmTokenHash: hashToken(old),
                confirmExpiresAt: new Date(0),
            },
        });
        expect(await confirmNewsletterToken(old)).toBeNull();
        await prisma.newsletterSubscriber.update({
            where: { id: subscriber.id },
            data: {
                confirmTokenHash: hashToken(next),
                confirmExpiresAt: new Date(Date.now() + 60000),
            },
        });
        expect(await confirmNewsletterToken(old)).toBeNull();
        expect(await confirmNewsletterToken(next)).not.toBeNull();
    });
    it('grava contato cifrado e faz round-trip sem texto claro no banco', async () => {
        const name = 'Pessoa de teste';
        const record = await prisma.contactMessage.create({
            data: {
                name: encryptSensitive(name)!,
                email: encryptSensitive('person@example.test')!,
                subject: 'Geral',
                message: encryptSensitive('Mensagem sintética')!,
                encryptedAt: new Date(),
            },
        });
        expect(record.name).not.toContain(name);
        expect(record.email).not.toContain('@');
        expect(decryptSensitive(record.name)).toBe(name);
    });
    it('sessões reais respeitam revogação, inatividade e desativação de conta', async () => {
        const role = await prisma.role.create({
            data: { key: 'test-session', name: 'Sessão teste', description: 'Teste' },
        });
        const user = await prisma.user.create({
            data: {
                name: 'Teste',
                email: 'session@example.test',
                googleSub: 'integration-google-sub',
                initials: 'TS',
                roleId: role.id,
                status: 'ATIVO',
            },
        });
        const token = generateToken();
        cookieState.token = token;
        const session = await prisma.session.create({
            data: {
                userId: user.id,
                tokenHash: hashToken(token),
                authMethod: 'GOOGLE_WORKSPACE',
                googleSub: 'integration-google-sub',
                workspaceDomain: 'example.test',
                expiresAt: new Date(Date.now() + 3600000),
            },
        });
        expect((await getCurrentUser())?.id).toBe(user.id);
        await prisma.user.update({ where: { id: user.id }, data: { status: 'INATIVO' } });
        expect(await getCurrentUser()).toBeNull();
        await prisma.user.update({ where: { id: user.id }, data: { status: 'ATIVO' } });
        await prisma.session.update({
            where: { id: session.id },
            data: { lastSeenAt: new Date(Date.now() - 31 * 60000) },
        });
        expect(await getCurrentUser()).toBeNull();
        await prisma.session.update({
            where: { id: session.id },
            data: { revokedAt: null, lastSeenAt: new Date() },
        });
        await revokeAllSessions(user.id);
        expect(await getCurrentUser()).toBeNull();
    });
    it('fila de exclusão é atômica sob concorrência e pode repetir DELETE ausente', async () => {
        const media = await prisma.media.create({
            data: {
                filename: 'teste.png',
                originalName: 'Teste.png',
                storageKey: 'biblioteca/teste.png',
                mimeType: 'image/png',
                size: 1,
                url: '/api/arquivos/biblioteca/teste.png',
            },
        });
        const results = await Promise.all([
            queueMediaDeletion(media.id),
            queueMediaDeletion(media.id),
        ]);
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(await prisma.media.findUnique({ where: { id: media.id } })).toBeNull();
        const job = await prisma.mediaDeletion.findUniqueOrThrow({
            where: { storageKey: media.storageKey },
        });
        expect(await processMediaDeletion(job.id)).toBe('deleted');
        expect(await processMediaDeletion(job.id)).toBe('skipped');
    });
    it('mídia usada em notícia nunca entra na fila de exclusão', async () => {
        const media = await prisma.media.create({
            data: {
                filename: 'usado.png',
                originalName: 'Usado.png',
                storageKey: 'biblioteca/usado.png',
                mimeType: 'image/png',
                size: 1,
                url: '/api/arquivos/biblioteca/usado.png',
            },
        });
        await prisma.post.update({ where: { slug: 'visivel' }, data: { coverMediaId: media.id } });
        expect(await queueMediaDeletion(media.id)).toEqual({ ok: false, reason: 'in-use' });
        expect(
            await prisma.mediaDeletion.findUnique({ where: { storageKey: media.storageKey } }),
        ).toBeNull();
    });
});
