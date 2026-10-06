import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    find: vi.fn(),
    change: vi.fn(),
    revoke: vi.fn(),
    transaction: vi.fn(),
    session: vi.fn(),
    rate: vi.fn(),
    hash: vi.fn(),
    verify: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/db', () => ({
    prisma: { user: { findUnique: mocks.find }, $transaction: mocks.transaction },
}));
vi.mock('@/lib/server/auth', () => ({
    PASSWORD_DISABLED: 'O acesso é exclusivo pela conta institucional do Google Workspace.',
}));
vi.mock('@/lib/server/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@/lib/server/crypto', () => ({ hashPassword: mocks.hash, verifyPassword: mocks.verify }));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: mocks.rate }));
vi.mock('@/lib/server/queries', () => ({ getSiteSettings: vi.fn(), SITE_SETTINGS_KEY: 'site' }));
vi.mock('@/lib/server/actions', () => ({
    actionError: (message: string, fieldErrors?: unknown) => ({ ok: false, message, fieldErrors }),
    actionOk: (message: string) => ({ ok: true, message }),
    formString: vi.fn(),
    formBoolean: vi.fn(),
    zodErrors: () => ({}),
    runAction: async (
        _permission: string,
        body: (user: { id: string; email: string }) => Promise<unknown>,
    ) => body({ id: 'u-1', email: 'equipe@example.test' }),
}));
import { alterarSenha } from '@/app/admin/configuracoes/actions';

function form(current = ' senha atual com espaços ', next = ' senha nova com espaços ') {
    const data = new FormData();
    data.set('currentPassword', current);
    data.set('newPassword', next);
    data.set('confirmPassword', next);
    return data;
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue({ passwordHash: 'old-hash' });
    mocks.change.mockResolvedValue({ count: 1 });
    mocks.revoke.mockResolvedValue({ count: 2 });
    mocks.hash.mockResolvedValue('new-hash');
    mocks.verify.mockResolvedValue(true);
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.transaction.mockImplementation(async (body: (tx: unknown) => Promise<unknown>) =>
        body({ user: { updateMany: mocks.change }, session: { updateMany: mocks.revoke } }),
    );
});
describe('troca de senha local desativada no servidor', () => {
    it('nega mesmo com senha atual válida e conta previamente autenticada', async () => {
        mocks.verify.mockResolvedValue(true);
        expect(await alterarSenha({ ok: false }, form())).toMatchObject({
            ok: false,
            message: expect.stringContaining('exclusivo'),
        });
        expect(mocks.verify).not.toHaveBeenCalled();
        expect(mocks.hash).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.session).not.toHaveBeenCalled();
    });
});
