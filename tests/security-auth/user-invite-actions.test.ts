import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/server/auth';
const mocks = vi.hoisted(() => ({
    actor: null as SessionUser | null,
    origin: vi.fn(),
    role: vi.fn(),
    existing: vi.fn(),
    target: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    queue: vi.fn(),
    transaction: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({
    getCurrentUser: async () => mocks.actor,
    hasPermission: (user: SessionUser | null, permission: string) =>
        Boolean(user?.permissions.includes(permission)),
    revokeAllSessions: vi.fn(),
}));
vi.mock('@/lib/server/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@/lib/server/request-origin', async (original) => ({
    ...(await original<object>()),
    assertTrustedMutationOrigin: mocks.origin,
}));
vi.mock('@/lib/server/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/server/env', () => ({
    env: {
        appUrl: 'https://spm.example',
        google: { allowedDomain: 'example.test' },
        authSecret: 'unit-only-abcdefghijklmnopqrstuvwxyz0123456789',
        encryptionKey: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    },
    isMailEnabled: () => false,
}));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        role: { findUnique: mocks.role },
        user: { findUnique: mocks.existing, findFirst: mocks.target },
        regional: { findUnique: async () => ({ id: 'regional-a' }) },
        $transaction: mocks.transaction,
    },
}));
import { convidarUsuario, executarAcaoUsuario } from '@/app/admin/usuarios/actions';
import { decryptSensitive } from '@/lib/server/crypto';

const actor = (): SessionUser => ({
    id: 'actor',
    email: 'actor@example.test',
    name: 'Operador',
    initials: 'OP',
    status: 'ATIVO',
    role: { id: 'role-admin', key: 'admin', name: 'Administrador' },
    permissions: ['usuarios'],
    regionalId: null,
    regionalName: null,
    mustChangePassword: false,
});
const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor = actor();
    mocks.origin.mockResolvedValue(undefined);
    mocks.role.mockResolvedValue({ id: 'editor', key: 'editor', name: 'Editor' });
    mocks.existing.mockResolvedValue(null);
    mocks.create.mockImplementation(async ({ data }) => ({ id: 'user-created', ...data }));
    mocks.target.mockResolvedValue({
        id: 'user-target',
        name: 'Pessoa sintética',
        email: 'person@example.test',
        status: 'ATIVO',
        roleId: 'editor',
        regionalId: null,
        notificationVersion: 2,
        role: { key: 'editor', name: 'Editor' },
    });
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.queue.mockResolvedValue({ id: 'job' });
    mocks.transaction.mockImplementation((body: (tx: unknown) => Promise<unknown>) =>
        body({
            user: { create: mocks.create, updateMany: mocks.update, findFirst: mocks.target },
            genericEmailJob: { create: mocks.queue },
        }),
    );
});
describe('authorized Workspace account creation and delivery intentions', () => {
    it('creates an explicitly authorized account and ciphertext mail job atomically while SMTP is off', async () => {
        const result = await convidarUsuario(
            { ok: false },
            form({
                name: 'Pessoa sintética',
                email: 'person@example.test',
                roleId: 'editor',
                regionalId: '',
                passwordHash: 'attacker',
                notificationVersion: '999',
                mfaRequired: 'false',
            }),
        );
        expect(result.ok).toBe(true);
        expect(result.message).not.toContain('Convite enviado');
        expect(mocks.transaction).toHaveBeenCalledOnce();
        const created = mocks.create.mock.calls[0][0].data;
        expect(created).toMatchObject({
            passwordHash: null,
            notificationVersion: 1,
            mfaRequired: true,
            status: 'ATIVO',
        });
        const job = mocks.queue.mock.calls[0][0].data;
        expect(job).toMatchObject({
            kind: 'USER_INVITE',
            userId: 'user-created',
            versionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        expect(job.payloadEncrypted).toMatch(/^v1\./);
        expect(job.payloadEncrypted).not.toContain('person@example.test');
        expect(JSON.parse(decryptSensitive(job.payloadEncrypted)!)).toMatchObject({
            email: 'person@example.test',
            inviteUrl: 'https://spm.example/atendente',
        });
    });
    it('does not report success if transactional queue insertion fails', async () => {
        mocks.queue.mockRejectedValue(new Error('provider credentials DB connection'));
        const result = await convidarUsuario(
            { ok: false },
            form({
                name: 'Pessoa sintética',
                email: 'person@example.test',
                roleId: 'editor',
                regionalId: '',
            }),
        );
        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).not.toContain('provider credentials');
    });
    it('increments the notification version and uses the freshly scoped target on resend', async () => {
        const result = await executarAcaoUsuario(
            { ok: false },
            form({ id: 'user-target', intent: 'reenviar-convite' }),
        );
        expect(result.ok).toBe(true);
        expect(mocks.update).toHaveBeenCalledWith({
            where: { id: 'user-target', status: 'ATIVO' },
            data: { notificationVersion: { increment: 1 } },
        });
        expect(mocks.queue.mock.calls[0][0].data.userId).toBe('user-target');
        expect(mocks.transaction).toHaveBeenCalledOnce();
    });
    it('denies a concurrently removed target before job creation', async () => {
        mocks.update.mockResolvedValue({ count: 0 });
        expect(
            (
                await executarAcaoUsuario(
                    { ok: false },
                    form({ id: 'user-target', intent: 'reenviar-convite' }),
                )
            ).ok,
        ).toBe(false);
        expect(mocks.queue).not.toHaveBeenCalled();
    });
    it('does not allow unauthenticated creation or a regional coordinator to grant admin', async () => {
        mocks.actor = null;
        const data = form({
            name: 'Pessoa sintética',
            email: 'person@example.test',
            roleId: 'admin',
            regionalId: 'regional-a',
        });
        expect((await convidarUsuario({ ok: false }, data)).ok).toBe(false);
        mocks.actor = {
            ...actor(),
            regionalId: 'regional-a',
            role: { id: 'coord', key: 'coord', name: 'Coordenação' },
        };
        mocks.role.mockResolvedValue({ id: 'admin', key: 'admin', name: 'Administrador' });
        expect((await convidarUsuario({ ok: false }, data)).ok).toBe(false);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});
