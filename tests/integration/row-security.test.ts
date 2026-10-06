import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import './guard';
import { PrismaClient } from '../../lib/generated/prisma/client';
import { contactReplayStatus } from '../../lib/server/contact-idempotency';
import { encryptSensitive } from '../../lib/server/crypto';
import { prisma as owner } from '../../lib/server/db';
import {
    createScopedDatabase, withActorDatabaseScope, withPublicContactDatabaseScope,
    withRetentionDatabaseScope,
    withContactMailDatabaseScope,
    withGenericMailDatabaseScope, withPublicNewsletterDatabaseScope,
} from '../../lib/server/database-scope';

let runtime: PrismaClient;
let permissionCreated = false;
let adminRoleCreated = false;
let adminRoleId = '';
let userPermissionCreated = false;
const prefix = 'rls-isolated-';
const ids = { a: prefix + 'a', b: prefix + 'b', admin: prefix + 'admin', role: prefix + 'role',
    ra: prefix + 'regional-a', rb: prefix + 'regional-b', ca: prefix + 'case-a', cb: prefix + 'case-b' };
const actor = (id: string) => ({ id });

beforeAll(async () => {
    // Only the guarded, disposable test owner may provision this test identity.
    const password = randomBytes(24).toString('base64url');
    await owner.$executeRawUnsafe(`CREATE ROLE spm_rls_test LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    await owner.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO spm_rls_test');
    await owner.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO spm_rls_test');
    await owner.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spm_rls_test');
    const url = new URL(process.env.DATABASE_URL!);
    url.username = 'spm_rls_test';
    url.password = password;
    runtime = createScopedDatabase(new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, max: 2 }) }));
    permissionCreated = !(await owner.permission.findUnique({ where: { key: 'atendimentos' } }));
    await owner.permission.upsert({ where: { key: 'atendimentos' }, update: {}, create: { key: 'atendimentos', label: 'RLS test', hint: 'isolated' } });
    userPermissionCreated = !(await owner.permission.findUnique({ where: { key: 'usuarios' } }));
    await owner.permission.upsert({ where: { key: 'usuarios' }, update: {}, create: { key: 'usuarios', label: 'RLS test users', hint: 'isolated' } });
    const existingAdmin = await owner.role.findUnique({ where: { key: 'admin' } });
    adminRoleCreated = !existingAdmin;
    adminRoleId = existingAdmin?.id ?? prefix + 'admin-role';
    if (!existingAdmin) await owner.role.create({ data: { id: adminRoleId, key: 'admin', name: 'RLS test admin', description: 'isolated', permissions: { create: { permissionKey: 'atendimentos' } } } });
    await owner.role.create({ data: { id: ids.role, key: ids.role, name: 'RLS test operator', description: 'isolated', permissions: { create: [{ permissionKey: 'atendimentos' }, { permissionKey: 'usuarios' }] } } });
    for (const [id, suffix] of [[ids.ra, 'a'], [ids.rb, 'b']]) await owner.regional.create({ data: { id, slug: id, uf: 'SP', name: 'RLS ' + suffix, region: 'SUDESTE', description: 'isolated', focus: [] } });
    for (const [id, regionalId, roleId] of [[ids.a, ids.ra, ids.role], [ids.b, ids.rb, ids.role], [ids.admin, null, adminRoleId]]) await owner.user.create({ data: { id: id!, regionalId, roleId: roleId!, email: id + '@example.test', name: id!, initials: 'RT', status: 'ATIVO' } });
    for (const [id, regionalId] of [[ids.ca, ids.ra], [ids.cb, ids.rb]]) await owner.atendimento.create({ data: { id, codigo: id, regionalId, idiomas: [], necessidades: [], retencaoAte: new Date('2030-01-01') } });
    for (const id of [ids.a, ids.b]) await owner.contactMessage.create({ data: { id: prefix + 'message-' + id, assignedToId: id, name: 'encrypted', email: 'encrypted', subject: 'isolated', message: 'encrypted', encryptedAt: new Date() } });
});

afterAll(async () => {
    await runtime?.$disconnect();
    await owner.atendimento.deleteMany({ where: { id: { startsWith: prefix } } });
    await owner.contactMessage.deleteMany({ where: { id: { startsWith: prefix } } });
    await owner.contactMessage.deleteMany({ where: { subject: 'RLS-public-test' } });
    await owner.newsletterSubscriber.deleteMany({ where: { id: { startsWith: prefix } } });
    await owner.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await owner.regional.deleteMany({ where: { id: { startsWith: prefix } } });
    await owner.role.deleteMany({ where: { id: ids.role } });
    if (adminRoleCreated) await owner.role.delete({ where: { id: adminRoleId } });
    if (permissionCreated) await owner.permission.delete({ where: { key: 'atendimentos' } });
    if (userPermissionCreated) await owner.permission.delete({ where: { key: 'usuarios' } });
    await owner.$executeRawUnsafe('DROP OWNED BY spm_rls_test');
    await owner.$executeRawUnsafe('DROP ROLE spm_rls_test');
    await owner.$disconnect();
});

describe('RLS real com runtime não proprietário, sem superuser/BYPASSRLS', () => {
    it('nega dados sensíveis sem contexto e mantém tabelas públicas acessíveis', async () => {
        const [role] = await runtime.$queryRaw<Array<{ super: boolean; bypass: boolean; owns: boolean }>>`
            SELECT r.rolsuper AS super, r.rolbypassrls AS bypass,
                EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'Atendimento' AND c.relowner = r.oid) AS owns
            FROM pg_roles r WHERE r.rolname = current_user`;
        expect(role).toEqual({ super: false, bypass: false, owns: false });
        expect(await runtime.atendimento.count()).toBe(0);
        expect(await runtime.contactMessage.count()).toBe(0);
        await expect(runtime.atendimento.create({ data: { codigo: 'unscoped', regionalId: ids.ra, idiomas: [], necessidades: [], retencaoAte: new Date() } })).rejects.toThrow();
        await expect(runtime.regional.count()).resolves.toBeGreaterThanOrEqual(2);
    });
    it('isola regionais na leitura, escrita e relações aninhadas', async () => {
        await withActorDatabaseScope(actor(ids.a), async () => {
            expect((await runtime.atendimento.findMany()).map(row => row.id)).toEqual([ids.ca]);
            expect((await runtime.atendimento.updateMany({ where: { id: ids.cb }, data: { observacoes: 'forbidden' } })).count).toBe(0);
            await expect(runtime.atendimento.create({ data: { codigo: 'foreign', regionalId: ids.rb, idiomas: [], necessidades: [], retencaoAte: new Date() } })).rejects.toThrow();
            const nested = await runtime.regional.findMany({ where: { id: { in: [ids.ra, ids.rb] } }, include: { atendimentos: true } });
            expect(nested.flatMap(row => row.atendimentos.map(value => value.id))).toEqual([ids.ca]);
            await expect(runtime.atendimentoEncaminhamento.create({ data: { atendimentoId: ids.cb, orgao: 'forbidden', descricao: 'test' } })).rejects.toThrow();
            await runtime.$transaction(async tx => {
                await tx.$queryRaw`SELECT id FROM "Atendimento" WHERE id = ${ids.ca} FOR UPDATE`;
                await tx.atendimentoEncaminhamento.create({ data: { atendimentoId: ids.ca, orgao: 'authorized', descricao: 'test' } });
            });
            expect(await runtime.atendimentoEncaminhamento.count()).toBe(1);
        });
    });
    it('reconsulta status/permissão reais, sem confiar no perfil enviado pelo chamador', async () => {
        await owner.user.update({ where: { id: ids.a }, data: { status: 'INATIVO' } });
        expect(await withActorDatabaseScope(actor(ids.a), () => runtime.atendimento.count())).toBe(0);
        await owner.user.update({ where: { id: ids.a }, data: { status: 'ATIVO' } });
        await owner.rolePermission.delete({ where: { roleId_permissionKey: { roleId: ids.role, permissionKey: 'atendimentos' } } });
        expect(await withActorDatabaseScope(actor(ids.a), () => runtime.atendimento.count())).toBe(0);
        await owner.rolePermission.create({ data: { roleId: ids.role, permissionKey: 'atendimentos' } });
        expect(await withActorDatabaseScope(actor(ids.admin), () => runtime.atendimento.count())).toBe(2);
    });
    it('isola mensagens por atribuição e não permite transferir para outra pessoa', async () => {
        await withActorDatabaseScope(actor(ids.a), async () => {
            expect((await runtime.contactMessage.findMany()).map(row => row.assignedToId)).toEqual([ids.a]);
            await expect(runtime.contactMessage.updateMany({ where: { assignedToId: ids.a }, data: { assignedToId: ids.b } })).rejects.toThrow();
        });
    });
    it('formulário público só cria e recebe sua própria linha, sem leitura/update/raw/tx', async () => {
        await withPublicContactDatabaseScope(async () => {
            expect(() => runtime.$extends({ name: 'bypass-attempt' })).toThrow('client extensions');
            const row = await runtime.contactMessage.create({ data: { id: 'caller-supplied-id', name: 'encrypted', email: 'encrypted', message: 'encrypted', subject: 'RLS-public-test', encryptedAt: new Date() }, select: { id: true } });
            expect(row.id).toMatch(/^[a-f0-9-]{36}$/);
            expect(() => runtime.contactMessage.findMany()).toThrow('only creation');
            expect(() => runtime.contactMessage.updateMany({ data: { status: 'ARQUIVADA' } })).toThrow('only creation');
        });
    });
    it('contextos simultâneos e conexões reutilizadas não vazam permissão após commit/rollback', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, index) => {
            const id = index % 2 ? ids.a : ids.b;
            return withActorDatabaseScope(actor(id), async () => (await runtime.atendimento.findMany()).map(row => row.id));
        }));
        for (let index = 0; index < results.length; index++) expect(results[index]).toEqual([index % 2 ? ids.ca : ids.cb]);
        await expect(withActorDatabaseScope(actor(ids.admin), () => runtime.$transaction(async () => { throw new Error('synthetic rollback'); }))).rejects.toThrow('rollback');
        expect(await runtime.atendimento.count()).toBe(0);
        const [values] = await runtime.$queryRaw<Array<{ scope: string | null; actor: string | null }>>`SELECT current_setting('spm.scope', true) AS scope, current_setting('spm.actor_id', true) AS actor`;
        expect(values.scope || '').toBe('');
        expect(values.actor || '').toBe('');
    });
    it('rotina interna de retenção opera sem abrir consultas públicas nem alterar contexto de usuários', async () => {
        expect(await withRetentionDatabaseScope(() => runtime.atendimento.count())).toBe(2);
        expect(await withRetentionDatabaseScope(() => runtime.contactMessage.count({ where: { OR: [{ id: { startsWith: prefix } }, { subject: 'RLS-public-test' }] } }))).toBe(3);
        expect(await runtime.contactMessage.count()).toBe(0);
    });
    it('sequência aloca números únicos entre regionais sem ler fichas de terceiros', async () => {
        const values = await Promise.all(Array.from({ length: 30 }, (_, index) =>
            withActorDatabaseScope(actor(index % 2 ? ids.a : ids.b), async () => {
                const [row] = await runtime.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('"Atendimento_codigo_seq"') AS value`;
                return row.value.toString();
            })));
        expect(new Set(values).size).toBe(30);
        expect(await runtime.atendimento.count()).toBe(0);
    });
    it('claim/mensagem/audit/outbox são um commit e runtime público não atravessa key/model/raw', async () => {
        const keyHash = 'a'.repeat(64);
        const payloadHash = 'b'.repeat(64);
        await owner.idempotencyRequest.deleteMany({ where: { keyHash } });
        const outcomes = await Promise.all(Array.from({ length: 20 }, () =>
            withPublicContactDatabaseScope(async () => {
                try {
                    await runtime.$transaction(async tx => {
                        await tx.idempotencyRequest.create({ data: { keyHash, payloadHash, expiresAt: new Date() } });
                        const contact = await tx.contactMessage.create({ data: { name: 'encrypted', email: 'encrypted', message: 'encrypted', subject: 'RLS-public-test', encryptedAt: new Date() }, select: { id: true } });
                        await tx.auditLog.create({ data: { action: 'Mensagem recebida pelo Fale Conosco', target: 'caller target', actorLabel: 'caller actor', metadata: { private: 'never persist' } } });
                        await tx.contactEmailJob.createMany({ data: [
                            { contactMessageId: contact.id, kind: 'NOTIFICATION' },
                            { contactMessageId: contact.id, kind: 'ACKNOWLEDGEMENT' },
                        ] });
                    });
                    return 'created';
                } catch {
                    expect((await runtime.idempotencyRequest.findUnique({ where: { keyHash } }))?.payloadHash).toBe(payloadHash);
                    return 'replay';
                }
            }, { keyHash, payloadHash })));
        expect(outcomes.filter(value => value === 'created')).toHaveLength(1);
        expect(await owner.contactEmailJob.count()).toBe(2);
        expect(await runtime.contactEmailJob.count()).toBe(0);
        await withPublicContactDatabaseScope(async () => {
            expect(() => runtime.idempotencyRequest.findUnique({ where: { keyHash: 'c'.repeat(64) } })).toThrow('outside scope');
            await expect(runtime.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; })).rejects.toThrow('only contact');
            await expect(runtime.$transaction(async tx => { await tx.user.count(); })).rejects.toThrow('only contact');
            // findUniqueOrThrow itself is forbidden: only the bound findUnique
            // contract can look up the replay fingerprint.
            expect(() => runtime.idempotencyRequest.findUniqueOrThrow({ where: { keyHash } })).toThrow('exact replay key');
        }, { keyHash, payloadHash });
        await withContactMailDatabaseScope(async () => {
            expect(await runtime.contactEmailJob.count()).toBe(2);
            expect(await runtime.contactMessage.count()).toBe(1);
            expect((await runtime.contactMessage.updateMany({ data: { name: 'forbidden' } })).count).toBe(0);
        });
        const audit = await owner.auditLog.findFirstOrThrow({ where: { metadata: { path: ['contactMessageId'], string_contains: '-' } }, orderBy: { createdAt: 'desc' } });
        expect(audit.actorLabel).toBe('site público');
        expect(audit.metadata).not.toHaveProperty('private');
        await owner.idempotencyRequest.deleteMany({ where: { keyHash } });
        await owner.auditLog.delete({ where: { id: audit.id } });
    });
    it('rollback de outbox inválida não deixa claim/mensagem/audit e payload diferente conflita', async () => {
        const keyHash = 'd'.repeat(64), payloadHash = 'e'.repeat(64);
        const before = await owner.contactMessage.count({ where: { subject: 'RLS-public-test' } });
        await expect(withPublicContactDatabaseScope(() => runtime.$transaction(async tx => {
            await tx.idempotencyRequest.create({ data: { keyHash, payloadHash, expiresAt: new Date() } });
            const contact = await tx.contactMessage.create({ data: { name: 'encrypted', email: 'encrypted', message: 'encrypted', subject: 'RLS-public-test', encryptedAt: new Date() }, select: { id: true } });
            await tx.auditLog.create({ data: { action: 'Mensagem recebida pelo Fale Conosco', target: contact.id, actorLabel: 'site público' } });
            // Missing ACKNOWLEDGEMENT is a real validation failure after writes.
            await tx.contactEmailJob.createMany({ data: [{ contactMessageId: contact.id, kind: 'NOTIFICATION' }] });
        }), { keyHash, payloadHash })).rejects.toThrow('Invalid public contact email jobs');
        expect(await owner.idempotencyRequest.findUnique({ where: { keyHash } })).toBeNull();
        expect(await owner.contactMessage.count({ where: { subject: 'RLS-public-test' } })).toBe(before);
        await withPublicContactDatabaseScope(async () => {
            expect(() => runtime.contactMessage.create({ data: { name: 'encrypted', email: 'encrypted', message: 'encrypted', subject: 'RLS-public-test', encryptedAt: new Date(), emailJobs: { create: { kind: 'NOTIFICATION' } } } })).toThrow('creation fields');
        }, { keyHash, payloadHash });
        await owner.idempotencyRequest.create({ data: { keyHash, payloadHash, expiresAt: new Date(Date.now() + 60_000) } });
        await withPublicContactDatabaseScope(async () => {
            const row = await runtime.idempotencyRequest.findUnique({ where: { keyHash } });
            expect(contactReplayStatus(row!, 'f'.repeat(64))).toBe('conflict');
        }, { keyHash, payloadHash: 'f'.repeat(64) });
        await owner.idempotencyRequest.delete({ where: { keyHash } });
    });
    it('newsletter e job cifrado são atômicos, bound ao assinante/token e sem delegados aninhados', async () => {
        const subscriberId = prefix + 'subscriber', tokenHash = '1'.repeat(64);
        const expiresAt = new Date(Date.now() + 12 * 3_600_000);
        const payloadEncrypted = encryptSensitive(JSON.stringify({ version: 1, synthetic: true }))!;
        await withPublicNewsletterDatabaseScope(() => runtime.$transaction(async tx => {
            await tx.newsletterSubscriber.create({ data: { id: 'caller-id', email: subscriberId + '@example.test',
                confirmed: false, confirmTokenHash: tokenHash, confirmExpiresAt: expiresAt } });
            await tx.genericEmailJob.create({ data: { kind: 'NEWSLETTER_CONFIRMATION', newsletterSubscriberId: subscriberId,
                versionHash: tokenHash, payloadEncrypted, expiresAt } });
        }), { subscriberId, tokenHash });
        expect(await owner.genericEmailJob.count({ where: { newsletterSubscriberId: subscriberId } })).toBe(1);
        expect(await runtime.genericEmailJob.count()).toBe(0);
        await withPublicNewsletterDatabaseScope(async () => {
            expect(() => runtime.genericEmailJob.findMany()).toThrow('only its atomic');
            expect(() => runtime.$queryRaw`SELECT 1`).toThrow('raw SQL');
            await expect(runtime.$transaction(async tx => { await tx.user.count(); })).rejects.toThrow('only its atomic');
            expect(() => runtime.newsletterSubscriber.updateMany({ where: { id: 'another', confirmed: false },
                data: { confirmTokenHash: tokenHash, confirmExpiresAt: expiresAt } })).toThrow('outside scope');
        }, { subscriberId, tokenHash });
        const failedSubscriber = prefix + 'subscriber-rollback';
        await expect(withPublicNewsletterDatabaseScope(() => runtime.$transaction(async tx => {
            await tx.newsletterSubscriber.create({ data: { email: failedSubscriber + '@example.test',
                confirmTokenHash: '2'.repeat(64), confirmExpiresAt: expiresAt } });
            await tx.genericEmailJob.create({ data: { kind: 'NEWSLETTER_CONFIRMATION', newsletterSubscriberId: failedSubscriber,
                versionHash: tokenHash, payloadEncrypted, expiresAt } });
        }), { subscriberId: failedSubscriber, tokenHash: '2'.repeat(64) })).rejects.toThrow('Invalid public newsletter email intent');
        expect(await owner.newsletterSubscriber.findUnique({ where: { id: failedSubscriber } })).toBeNull();
        await withGenericMailDatabaseScope(async () => {
            expect(await runtime.genericEmailJob.count()).toBe(1);
            expect(() => runtime.$extends({ name: 'worker-bypass-attempt' })).toThrow('client extensions');
            expect((await runtime.newsletterSubscriber.findUnique({ where: { id: subscriberId }, select: { id: true, confirmed: true } }))?.id).toBe(subscriberId);
            expect(() => runtime.newsletterSubscriber.updateMany({ data: { confirmed: true } })).toThrow('bounded source');
            expect(() => runtime.user.findUnique({ where: { id: ids.a }, select: { passwordHash: true } })).toThrow('bounded source');
            expect(() => runtime.$queryRaw`SELECT current_user`).toThrow('database clock');
            expect((await runtime.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0].now).toBeInstanceOf(Date);
        });
    });
    it('SQL revalida usuários/regional no job de convite e reverte versão em falha de payload', async () => {
        const payloadEncrypted = encryptSensitive('synthetic invite')!;
        const expiresAt = new Date(Date.now() + 3_600_000);
        await withActorDatabaseScope(actor(ids.a), async () => {
            await expect(runtime.genericEmailJob.create({ data: { kind: 'USER_INVITE', userId: ids.b,
                versionHash: '3'.repeat(64), payloadEncrypted, expiresAt } })).rejects.toThrow();
            await runtime.genericEmailJob.create({ data: { kind: 'USER_INVITE', userId: ids.a,
                versionHash: '4'.repeat(64), payloadEncrypted, expiresAt } });
        });
        const before = (await owner.user.findUniqueOrThrow({ where: { id: ids.a } })).notificationVersion;
        await expect(withActorDatabaseScope(actor(ids.a), () => runtime.$transaction(async tx => {
            await tx.user.update({ where: { id: ids.a }, data: { notificationVersion: { increment: 1 } } });
            await tx.genericEmailJob.create({ data: { kind: 'USER_INVITE', userId: ids.a,
                versionHash: '5'.repeat(64), payloadEncrypted: 'plaintext-forbidden', expiresAt } });
        }))).rejects.toThrow();
        expect((await owner.user.findUniqueOrThrow({ where: { id: ids.a } })).notificationVersion).toBe(before);
        await withGenericMailDatabaseScope(async () => {
            expect((await runtime.user.findUnique({ where: { id: ids.a }, select: { id: true, status: true, notificationVersion: true } }))?.id).toBe(ids.a);
            expect(await runtime.user.findUnique({ where: { id: ids.b }, select: { id: true } })).toBeNull();
            expect(() => runtime.user.update({ where: { id: ids.a }, data: { status: 'INATIVO' } })).toThrow('bounded source');
        });
    });
    it('retention só vê/remove ciphertext vencido e preserva jobs ainda ativos', async () => {
        const job = await owner.genericEmailJob.create({ data: { kind: 'USER_INVITE', userId: ids.a,
            versionHash: '6'.repeat(64), payloadEncrypted: encryptSensitive('expired synthetic')!,
            createdAt: new Date(Date.now() - 7_200_000), expiresAt: new Date(Date.now() - 3_600_000) } });
        await withRetentionDatabaseScope(async () => {
            expect((await runtime.genericEmailJob.findMany()).map(row => row.id)).toEqual([job.id]);
            expect((await runtime.genericEmailJob.deleteMany()).count).toBe(1);
        });
        expect(await owner.genericEmailJob.count()).toBe(2);
    });
});
