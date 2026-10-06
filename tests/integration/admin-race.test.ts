import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import './guard';
import { PrismaClient } from '../../lib/generated/prisma/client';
import type { SessionUser } from '../../lib/server/auth';
import { createScopedDatabase, withActorDatabaseScope } from '../../lib/server/database-scope';

const state = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock('../../lib/server/db', () => ({ get prisma() { return state.client; } }));
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const prefix = 'admin-race-isolated-';
let roleId = '';
let roleCreated = false;
let permissionCreated = false;
let rolePermissionCreated = false;
let previousActive: string[] = [];
let actors: SessionUser[];
beforeAll(async () => {
    const password = randomBytes(24).toString('base64url');
    await owner.$executeRawUnsafe(`CREATE ROLE spm_race_test LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    await owner.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO spm_race_test');
    await owner.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO spm_race_test');
    const url = new URL(process.env.DATABASE_URL!);
    url.username = 'spm_race_test'; url.password = password;
    state.client = createScopedDatabase(new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, max: 2 }) }));
    permissionCreated = !(await owner.permission.findUnique({ where: { key: 'usuarios' } }));
    await owner.permission.upsert({ where: { key: 'usuarios' }, update: {}, create: { key: 'usuarios', label: 'Race test', hint: 'isolated' } });
    const existing = await owner.role.findUnique({ where: { key: 'admin' } });
    roleCreated = !existing; roleId = existing?.id ?? prefix + 'role';
    if (!existing) await owner.role.create({ data: { id: roleId, key: 'admin', name: prefix + 'role', description: 'isolated' } });
    rolePermissionCreated = !(await owner.rolePermission.findUnique({ where: { roleId_permissionKey: { roleId, permissionKey: 'usuarios' } } }));
    await owner.rolePermission.upsert({ where: { roleId_permissionKey: { roleId, permissionKey: 'usuarios' } }, update: {}, create: { roleId, permissionKey: 'usuarios' } });
    // The fixture has exactly two active admins; preserve existing synthetic
    // fixture statuses and restore them in cleanup before another file runs.
    previousActive = (await owner.user.findMany({ where: { roleId, status: 'ATIVO' }, select: { id: true } })).map(row => row.id);
    await owner.user.updateMany({ where: { id: { in: previousActive } }, data: { status: 'INATIVO' } });
    actors = await Promise.all(['a', 'b'].map(async suffix => {
        const id = prefix + suffix;
        await owner.user.create({ data: { id, email: id + '@example.test', name: id, initials: 'RT', status: 'ATIVO', roleId } });
        return { id, email: id + '@example.test', name: id, initials: 'RT', status: 'ATIVO',
            role: { id: roleId, key: 'admin', name: 'isolated' }, regionalId: null, regionalName: null,
            permissions: ['usuarios'], mustChangePassword: false };
    }));
});
afterAll(async () => {
    await state.client?.$disconnect();
    await owner.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await owner.user.updateMany({ where: { id: { in: previousActive } }, data: { status: 'ATIVO' } });
    if (rolePermissionCreated) await owner.rolePermission.delete({ where: { roleId_permissionKey: { roleId, permissionKey: 'usuarios' } } });
    if (roleCreated) await owner.role.delete({ where: { id: roleId } });
    if (permissionCreated) await owner.permission.delete({ where: { key: 'usuarios' } });
    await owner.$executeRawUnsafe('DROP OWNED BY spm_race_test');
    await owner.$executeRawUnsafe('DROP ROLE spm_race_test');
    await owner.$disconnect();
});

describe('corrida real entre dois administradores no runtime restrito', () => {
    it('serializa revogação, revalida o actor após lock e preserva um admin ativo', async () => {
        const { withProtectedUserMutation, preserveActiveAdministrator } = await import('../../lib/server/user-management');
        const results = await Promise.allSettled(actors.map((actor, index) => withActorDatabaseScope(actor,
            () => withProtectedUserMutation(actor, actors[1 - index].id, async (tx, _current, target) => {
                await preserveActiveAdministrator(tx, target);
                // Without the shared advisory lock, both snapshots can see two
                // active admins and this deliberate overlap would deactivate both.
                await new Promise(done => setTimeout(done, 25));
                return tx.user.updateMany({ where: { id: target.id, status: 'ATIVO' }, data: { status: 'INATIVO' } });
            }))));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
        expect(await owner.user.count({ where: { roleId, status: 'ATIVO' } })).toBe(1);
        const [privileges] = await state.client!.$queryRaw<Array<{ superuser: boolean; bypass: boolean }>>`
            SELECT rolsuper AS superuser, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
        expect(privileges).toEqual({ superuser: false, bypass: false });
    });
});
