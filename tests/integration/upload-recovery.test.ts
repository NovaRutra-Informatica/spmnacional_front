import { afterAll, describe, expect, it, vi } from 'vitest';
import './guard';
import { prisma } from '../../lib/server/db';
import { readStoredFile } from '../../lib/server/storage';
import { processMediaDeletion } from '../../lib/server/media-deletion';

vi.mock('@/lib/server/auth', () => ({
    getCurrentUser: async () => ({ id: 'isolated-upload-actor', email: 'isolated@example.test' }),
    hasPermission: () => true,
}));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/server/audit', () => ({ recordAudit: async () => undefined }));
import { POST } from '../../app/api/admin/uploads/route';

const originalName = 'isolated-upload-recovery-failure.png';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
afterAll(async () => prisma.$disconnect());

describe('upload recovery across SQL and private storage', () => {
    it('keeps the recovery intention after real metadata SQL failure and later removes the orphan', async () => {
        await prisma.user.create({
            data: {
                id: 'isolated-upload-actor',
                name: 'Synthetic upload actor',
                initials: 'SU',
                email: 'isolated-upload@example.test',
                role: {
                    create: {
                        key: 'isolated-upload-role',
                        name: 'Synthetic upload role',
                        description: 'Isolated fixture',
                    },
                },
            },
        });
        // Only this synthetic filename is rejected. Other concurrently running
        // integration fixtures are unaffected by this temporary SQL trigger.
        await prisma.$executeRawUnsafe(
            `CREATE FUNCTION isolated_upload_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."originalName"='${originalName}' THEN RAISE EXCEPTION 'synthetic metadata failure'; END IF; RETURN NEW; END $$`,
        );
        await prisma.$executeRawUnsafe(
            'CREATE TRIGGER isolated_upload_reject BEFORE INSERT ON "Media" FOR EACH ROW EXECUTE FUNCTION isolated_upload_reject()',
        );
        let key: string | undefined;
        try {
            const response = await POST(
                new Request('http://localhost:3147/api/admin/uploads?purpose=biblioteca', {
                    method: 'POST',
                    headers: { origin: 'http://localhost:3147', 'x-file-name': originalName },
                    body: png,
                }),
            );
            expect(response.status).toBe(500);
            expect(await response.text()).not.toContain('synthetic metadata failure');
            expect(await prisma.media.count({ where: { originalName } })).toBe(0);
            const job = await prisma.mediaDeletion.findFirstOrThrow({
                where: { storageKey: { endsWith: '-isolated-upload-recovery-failure.png' } },
            });
            key = job.storageKey;
            expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
            expect(await readStoredFile(key)).not.toBeNull();
            expect(await processMediaDeletion(job.id)).toBe('skipped');
            expect(await processMediaDeletion(job.id, new Date(Date.now() + 16 * 60_000))).toBe(
                'deleted',
            );
            expect(await readStoredFile(key)).toBeNull();
            expect(await prisma.mediaDeletion.findUnique({ where: { id: job.id } })).toBeNull();
        } finally {
            await prisma.$executeRawUnsafe(
                'DROP TRIGGER IF EXISTS isolated_upload_reject ON "Media"',
            );
            await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS isolated_upload_reject()');
            if (key) await prisma.mediaDeletion.deleteMany({ where: { storageKey: key } });
            await prisma.user.delete({ where: { id: 'isolated-upload-actor' } });
            await prisma.role.delete({ where: { key: 'isolated-upload-role' } });
        }
    });
});
