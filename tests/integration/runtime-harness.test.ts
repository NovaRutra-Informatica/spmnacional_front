import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './guard';
import { provisionIsolatedRuntime } from '../../scripts/lib/isolated-runtime.mjs';
import { PrismaClient } from '../../lib/generated/prisma/client';
import { databaseReady } from '../../lib/server/health';

const owner = new pg.Client({ connectionString: process.env.DATABASE_URL });
let runtimeUrl = '';
beforeAll(async () => owner.connect());
afterAll(async () => {
    await owner.query('DROP OWNED BY spm_e2e_app');
    await owner.query('DROP ROLE spm_e2e_app');
    await owner.end();
});

describe('harness real E2E e guard de migração no banco descartável', () => {
    it('provisiona e verifica o login runtime sem owner/superuser/BYPASSRLS/DDL/migrations', async () => {
        const runtime = await provisionIsolatedRuntime(process.env.DATABASE_URL!, process.env.SPM_ISOLATED_TEST_RUN!);
        runtimeUrl = runtime.databaseUrl;
        expect(runtime.role).toEqual({ name: 'spm_e2e_app', superuser: false, bypassRls: false,
            createDatabase: false, createRole: false, owner: false, createSchemaObjects: false });
        const client = new pg.Client({ connectionString: runtime.databaseUrl });
        try {
            await client.connect();
            expect((await client.query('SELECT current_user AS name')).rows[0].name).toBe('spm_e2e_app');
            await expect(client.query('SELECT * FROM _prisma_migrations LIMIT 1')).rejects.toMatchObject({ code: '42501' });
            await expect(client.query('CREATE TABLE public.e2e_forbidden(id int)')).rejects.toMatchObject({ code: '42501' });
        } finally { await client.end(); }
    });

    it('CLI read-only bloqueia contract pendente e exige ambas confirmações em manutenção', async () => {
        const migration = '20261002120000_sensitive_row_level_security';
        const before = (await owner.query('SELECT finished_at, checksum FROM _prisma_migrations WHERE migration_name = $1', [migration])).rows[0];
        expect(before.finished_at).toBeInstanceOf(Date);
        // Change only disposable metadata to exercise the actual standalone CLI.
        await owner.query('UPDATE _prisma_migrations SET finished_at = NULL WHERE migration_name = $1', [migration]);
        const check = (mode: string, maintenance = false, backup = false, protocol = 'scoped-rls-v1') => spawnSync(process.execPath,
            ['scripts/lib/check-migrations.mjs', `--mode=${mode}`, ...(protocol ? [`--app-protocol=${protocol}`] : [])], { encoding: 'utf8', windowsHide: true,
                timeout: 10000, env: { ...process.env, SPM_MAINTENANCE_CONFIRMED: String(maintenance),
                    SPM_DATABASE_BACKUP_VERIFIED: String(backup) } });
        try {
            const online = check('online', true, true);
            expect(online.status).toBe(1);
            expect(online.stderr).toContain('Online migration blocked');
            expect(check('maintenance', true, false).status).toBe(1);
            const maintenance = check('maintenance', true, true);
            expect(maintenance.status).toBe(0);
            expect(JSON.parse(maintenance.stdout)).toMatchObject({ mode: 'maintenance', safeToMigrate: true,
                pending: [{ name: migration, strategy: 'contract' }] });
            const after = (await owner.query('SELECT finished_at, checksum FROM _prisma_migrations WHERE migration_name = $1', [migration])).rows[0];
            expect(after).toEqual({ finished_at: null, checksum: before.checksum });
            const policy = (await owner.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'Atendimento'`)).rows[0];
            expect(policy).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
        } finally {
            await owner.query('UPDATE _prisma_migrations SET finished_at = $2 WHERE migration_name = $1', [migration, before.finished_at]);
        }
    });
    it('sem pending, CLI ainda recusa app sem capability e histórico aplicado ausente no candidato', async () => {
        const check = (protocol?: string) => spawnSync(process.execPath,
            ['scripts/lib/check-migrations.mjs', '--mode=online', ...(protocol ? [`--app-protocol=${protocol}`] : [])],
            { encoding: 'utf8', timeout: 10000, windowsHide: true, env: process.env });
        for (const protocol of [undefined, 'unscoped-v0']) {
            const result = check(protocol);
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('Application database protocol incompatible');
        }
        expect(check('scoped-rls-v1').status).toBe(0);
        const id = 'runtime-harness-applied-absent';
        await owner.query(`INSERT INTO _prisma_migrations(id, checksum, migration_name, finished_at, started_at, applied_steps_count)
            VALUES($1, 'synthetic', '20990101000000_absent_from_candidate', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`, [id]);
        try {
            const result = check('scoped-rls-v1');
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('Migration history incompatible');
        } finally { await owner.query('DELETE FROM _prisma_migrations WHERE id = $1', [id]); }
    });
    it('readiness valida FORCE RLS real nas6tabelas e nega owner/superuser mesmo com SELECT1 funcionando', async () => {
        const runtime = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });
        const privileged = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
        try {
            expect(await databaseReady(runtime)).toBe(true);
            expect(await databaseReady(privileged)).toBe(false);
            await owner.query('ALTER TABLE "ContactMessage" NO FORCE ROW LEVEL SECURITY');
            expect(await databaseReady(runtime)).toBe(false);
            await owner.query('ALTER TABLE "ContactMessage" FORCE ROW LEVEL SECURITY');
            await owner.query('ALTER TABLE "GenericEmailJob" DISABLE ROW LEVEL SECURITY');
            expect(await databaseReady(runtime)).toBe(false);
        } finally {
            await owner.query('ALTER TABLE "ContactMessage" FORCE ROW LEVEL SECURITY');
            await owner.query('ALTER TABLE "GenericEmailJob" ENABLE ROW LEVEL SECURITY');
            await runtime.$disconnect(); await privileged.$disconnect();
        }
    });
    it('os três CLIs DLQ fazem preview seguro e replay CAS sem enviar SMTP ou excluir storage', async () => {
        const fixture = 'dlq-cli-isolated';
        const payload = 'v1.' + 'a'.repeat(16) + '.' + 'b'.repeat(22) + '.Y2lwaGVydGV4dA';
        const storageKey = 'private/synthetic-key-never-output';
        await owner.query(`INSERT INTO "Role"(id,key,name,description,"updatedAt") VALUES($1,$1,$1,'isolated',CURRENT_TIMESTAMP)`, [fixture]);
        await owner.query(`INSERT INTO "User"(id,name,email,initials,"roleId","updatedAt") VALUES($1,'Synthetic','cli-never-output@example.test','ST',$1,CURRENT_TIMESTAMP)`, [fixture]);
        await owner.query(`INSERT INTO "ContactMessage"(id,name,email,message,subject,"encryptedAt","updatedAt") VALUES($1,$2,$2,$2,'isolated',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [fixture, payload]);
        const jobs = [
            { script: 'retry-media-deletion.ts', table: 'MediaDeletion', id: fixture + '-storage' },
            { script: 'retry-contact-email.ts', table: 'ContactEmailJob', id: fixture + '-contact' },
            { script: 'retry-generic-email.ts', table: 'GenericEmailJob', id: fixture + '-generic' },
        ];
        await owner.query(`INSERT INTO "MediaDeletion"(id,"storageKey",attempts,"deadLetterAt","failureCode") VALUES($1,$2,8,CURRENT_TIMESTAMP,'STORAGE_DELETE_FAILED')`, [jobs[0].id, storageKey]);
        await owner.query(`INSERT INTO "ContactEmailJob"(id,"contactMessageId",kind,attempts,"deadLetterAt","failureCode") VALUES($1,$2,'NOTIFICATION',8,CURRENT_TIMESTAMP,'SMTP_SEND_FAILED')`, [jobs[1].id, fixture]);
        await owner.query(`INSERT INTO "GenericEmailJob"(id,kind,"userId","versionHash","payloadEncrypted","expiresAt",attempts,"deadLetterAt","failureCode") VALUES($1,'USER_INVITE',$2,$3,$4,CURRENT_TIMESTAMP+INTERVAL '1 hour',8,CURRENT_TIMESTAMP,'SMTP_SEND_FAILED')`, [jobs[2].id, fixture, '7'.repeat(64), payload]);
        try {
            for (const job of jobs) {
                const run = (apply: boolean) => spawnSync(process.execPath,
                    ['--conditions=react-server', '--import', 'tsx', `scripts/${job.script}`, `--job=${job.id}`, ...(apply ? ['--apply'] : [])],
                    { encoding: 'utf8', timeout: 10000, windowsHide: true,
                        env: { ...process.env, DATABASE_URL: runtimeUrl, SPM_ISOLATED_TEST_DATABASE_ROLE: 'spm_e2e_app' } });
                const preview = run(false);
                expect(preview.status).toBe(0);
                expect(JSON.parse(preview.stdout)).toMatchObject({ id: job.id, attempts: 8, preview: true, retried: false });
                expect(preview.stdout + preview.stderr).not.toMatch(/private\/synthetic|cli-never-output|payloadEncrypted|postgresql:\/\//);
                expect((await owner.query(`SELECT attempts,"deadLetterAt" FROM "${job.table}" WHERE id=$1`, [job.id])).rows[0]).toMatchObject({ attempts: 8, deadLetterAt: expect.any(Date) });
                const apply = run(true);
                expect(apply.status).toBe(0);
                expect(JSON.parse(apply.stdout)).toMatchObject({ id: job.id, preview: false, retried: true });
                expect((await owner.query(`SELECT attempts,"deadLetterAt" FROM "${job.table}" WHERE id=$1`, [job.id])).rows[0]).toEqual({ attempts: 0, deadLetterAt: null });
                expect(run(true).status).toBe(1);
            }
        } finally {
            await owner.query('DELETE FROM "MediaDeletion" WHERE id=$1', [jobs[0].id]);
            await owner.query('DELETE FROM "ContactMessage" WHERE id=$1', [fixture]);
            await owner.query('DELETE FROM "User" WHERE id=$1', [fixture]);
            await owner.query('DELETE FROM "Role" WHERE id=$1', [fixture]);
        }
    });
});
