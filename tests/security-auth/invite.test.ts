import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ write: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/server/db', () => ({
    prisma: { user: { updateMany: mocks.write }, session: { create: mocks.session } },
}));
vi.mock('@/lib/server/auth', () => ({
    PASSWORD_DISABLED: 'O acesso é exclusivo pela conta institucional do Google Workspace.',
}));
vi.mock('@/lib/server/actions', () => ({
    actionError: (message: string) => ({ ok: false, message }),
}));
import { definirSenha } from '@/app/convite/[token]/actions';
import { entrar } from '@/app/atendente/actions';
describe('nenhum endpoint legado contorna Workspace', () => {
    it.each([definirSenha, entrar])(
        'nega formulário antigo sem mutação e sem sessão',
        async (action) => {
            const data = new FormData();
            data.set('email', 'admin@example.test');
            data.set('token', 'a'.repeat(43));
            data.set('senha', 'uma senha anterior válida');
            data.set('confirmacao', 'uma senha anterior válida');
            expect(await action({ ok: false }, data)).toMatchObject({
                ok: false,
                message: expect.stringContaining('exclusivo'),
            });
            expect(mocks.write).not.toHaveBeenCalled();
            expect(mocks.session).not.toHaveBeenCalled();
        },
    );
});
