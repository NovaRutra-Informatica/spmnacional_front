import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/server/auth';
const mocks = vi.hoisted(() => ({
    lock: vi.fn(),
    fresh: vi.fn(),
    target: vi.fn(),
    count: vi.fn(),
    transaction: vi.fn(),
}));
vi.mock('@/lib/server/db', () => ({ prisma: { $transaction: mocks.transaction } }));
import {
    preserveActiveAdministrator,
    withProtectedUserMutation,
} from '@/lib/server/user-management';
const actor = (id = 'admin-a'): SessionUser => ({
    id,
    email: `${id}@example.test`,
    name: id,
    initials: 'AA',
    status: 'ATIVO',
    role: { id: 'admin-role', key: 'admin', name: 'Administrador' },
    permissions: ['usuarios'],
    regionalId: null,
    regionalName: null,
    mustChangePassword: false,
});
const target = {
    id: 'admin-b',
    roleId: 'admin-role',
    status: 'ATIVO',
    regionalId: null,
    role: { key: 'admin' },
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.lock.mockResolvedValue([{ locked: '' }]);
    mocks.count.mockResolvedValue(2);
    mocks.fresh.mockImplementation(async ({ where }) => ({
        ...actor(where.id),
        role: {
            ...actor().role,
            permissions: [{ permissionKey: 'usuarios' }],
        },
    }));
    mocks.target.mockResolvedValue(target);
    mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
        work({
            $queryRaw: mocks.lock,
            user: { findUnique: mocks.fresh, findFirst: mocks.target, count: mocks.count },
        }),
    );
});
describe('serialized user privilege mutations', () => {
    it('locks before reloading the actor/target and applies the guard inside that transaction', async () => {
        const mutate = vi.fn(async () => 'written');
        expect(
            await withProtectedUserMutation(actor(), target.id, async (tx, current, row) => {
                await preserveActiveAdministrator(tx, row);
                expect(current.id).toBe(actor().id);
                return mutate();
            }),
        ).toBe('written');
        expect(mocks.lock.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
        expect(mocks.lock.mock.calls[0][1]).toBe('SPM:activeadmins');
        expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.fresh.mock.invocationCallOrder[0],
        );
        expect(mocks.count.mock.invocationCallOrder[0]).toBeLessThan(
            mutate.mock.invocationCallOrder[0],
        );
        expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
            maxWait: 5000,
            timeout: 10000,
        });
    });
    it('refuses the final active admin before any write', async () => {
        mocks.count.mockResolvedValue(1);
        const mutate = vi.fn();
        await expect(
            withProtectedUserMutation(actor(), target.id, async (tx, _current, row) => {
                await preserveActiveAdministrator(tx, row);
                mutate();
            }),
        ).rejects.toThrow('última conta ativa');
        expect(mutate).not.toHaveBeenCalled();
    });
    it.each(['revoked', 'permissions-removed', 'identity-changed'])(
        'rechecks the actor after waiting for the lock: %s',
        async (reason) => {
            const fresh = {
                ...actor(),
                status: reason === 'revoked' ? 'INATIVO' : 'ATIVO',
                email: reason === 'identity-changed' ? 'another@example.test' : actor().email,
                role: {
                    ...actor().role,
                    permissions:
                        reason === 'permissions-removed' ? [] : [{ permissionKey: 'usuarios' }],
                },
            };
            mocks.fresh.mockResolvedValue(fresh);
            const mutate = vi.fn();
            await expect(withProtectedUserMutation(actor(), target.id, mutate)).rejects.toThrow(
                'Sem permissão',
            );
            expect(mocks.target).not.toHaveBeenCalled();
            expect(mutate).not.toHaveBeenCalled();
        },
    );
    it('uses the current regional scope rather than the cached session role', async () => {
        mocks.fresh.mockResolvedValue({
            ...actor(),
            regionalId: 'regional-b',
            role: {
                id: 'coordinator',
                key: 'coord',
                name: 'Coordenação',
                permissions: [{ permissionKey: 'usuarios' }],
            },
        });
        mocks.target.mockResolvedValue(null);
        await expect(withProtectedUserMutation(actor(), target.id, vi.fn())).rejects.toThrow(
            'escopo',
        );
        expect(mocks.target.mock.calls[0][0].where).toEqual({
            id: target.id,
            regionalId: 'regional-b',
            role: { key: { not: 'admin' } },
        });
    });
    it('two queued admins cannot deactivate each other after the first commits', async () => {
        const active = new Set(['admin-a', 'admin-b']);
        let previous = Promise.resolve();
        mocks.transaction.mockImplementation((work: (tx: unknown) => Promise<unknown>) => {
            const operation = previous.then(() =>
                work({
                    $queryRaw: mocks.lock,
                    user: {
                        findUnique: async ({ where }: { where: { id: string } }) => ({
                            ...actor(where.id),
                            status: active.has(where.id) ? 'ATIVO' : 'INATIVO',
                            role: { ...actor().role, permissions: [{ permissionKey: 'usuarios' }] },
                        }),
                        findFirst: async ({ where }: { where: { id: string } }) => ({
                            ...target,
                            id: where.id,
                            status: active.has(where.id) ? 'ATIVO' : 'INATIVO',
                        }),
                        count: async () => active.size,
                    },
                }),
            );
            previous = operation.then(
                () => undefined,
                () => undefined,
            );
            return operation;
        });
        const change = (user: SessionUser, id: string) =>
            withProtectedUserMutation(user, id, async (tx, _current, row) => {
                await preserveActiveAdministrator(tx, row);
                active.delete(row.id);
            });
        const results = await Promise.allSettled([
            change(actor('admin-a'), 'admin-b'),
            change(actor('admin-b'), 'admin-a'),
        ]);
        expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
        expect([...active]).toEqual(['admin-a']);
    });
});
