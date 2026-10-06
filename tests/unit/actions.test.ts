import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
const mocks = vi.hoisted(() => ({ user: vi.fn(), audit: vi.fn(), origin: vi.fn() }));
vi.mock('../../lib/server/auth', () => ({
    getCurrentUser: mocks.user,
    hasPermission: (user: { permissions: string[] } | null, permission: string) =>
        Boolean(user?.permissions.includes(permission)),
}));
vi.mock('../../lib/server/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('../../lib/server/request-origin', async (original) => ({
    ...(await original<object>()),
    assertTrustedMutationOrigin: mocks.origin,
}));
import { UntrustedOriginError } from '../../lib/server/request-origin';
import {
    ActionInputError,
    actionOk,
    authorize,
    formBoolean,
    formDate,
    formList,
    formNumber,
    formString,
    runAction,
    zodErrors,
} from '../../lib/server/actions';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.origin.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
    mocks.user.mockResolvedValue({
        id: 'u',
        email: 'user@example.test',
        permissions: ['noticias'],
    });
});
describe('barreira central de Server Actions', () => {
    it('autoriza somente permissão explícita e passa identidade ao corpo', async () => {
        const body = vi.fn().mockResolvedValue(actionOk('Salvo', { id: 'id' }));
        expect(await runAction('noticias', body)).toEqual({
            ok: true,
            message: 'Salvo',
            data: { id: 'id' },
        });
        expect(body).toHaveBeenCalledWith(expect.objectContaining({ id: 'u' }));
        expect(mocks.origin).toHaveBeenCalledOnce();
    });
    it('nega sessão ausente sem executar mutação', async () => {
        mocks.user.mockResolvedValue(null);
        const body = vi.fn();
        expect(await runAction('noticias', body)).toMatchObject({
            ok: false,
            message: 'Sua sessão expirou. Entre novamente.',
        });
        expect(body).not.toHaveBeenCalled();
    });
    it('nega permissão faltante e audita a tentativa', async () => {
        const body = vi.fn();
        expect(await runAction('usuarios', body)).toMatchObject({
            ok: false,
            message: 'Você não tem permissão para esta operação.',
        });
        expect(body).not.toHaveBeenCalled();
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'u', level: 'ALERTA' }),
        );
    });
    it('origem estrangeira falha antes de sessão ou escrita', async () => {
        mocks.origin.mockRejectedValue(new UntrustedOriginError());
        const body = vi.fn();
        expect((await runAction('noticias', body)).ok).toBe(false);
        expect(body).not.toHaveBeenCalled();
        expect(mocks.user).not.toHaveBeenCalled();
    });
    it('expõe somente mensagens de entrada conhecidas, não erros internos', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(
            await runAction('noticias', async () => {
                throw new ActionInputError('Entrada inválida.');
            }),
        ).toMatchObject({ message: 'Entrada inválida.' });
        expect(
            JSON.stringify(
                await runAction('noticias', async () => {
                    throw new Error('PASSWORD=secret');
                }),
            ),
        ).not.toContain('secret');
    });
    it('erro de Zod preserva mensagens de campo sem executar escrita', async () => {
        const result = await runAction('noticias', async () => {
            z.object({ title: z.string().min(2, 'Título curto') }).parse({ title: '' });
            return actionOk();
        });
        expect(result).toMatchObject({ ok: false, fieldErrors: { title: 'Título curto' } });
        expect(
            zodErrors(
                new z.ZodError([{ code: 'custom', path: [], message: 'Formulário inválido' }]),
            ),
        ).toEqual({ form: 'Formulário inválido' });
    });
    it('mantém sinal de redirect do Next', async () => {
        const redirect = { digest: 'NEXT_REDIRECT;replace;/admin;307;' };
        await expect(
            runAction('noticias', async () => {
                throw redirect;
            }),
        ).rejects.toBe(redirect);
    });
    it('authorize lança quando chamado diretamente sem sessão', async () => {
        mocks.user.mockResolvedValue(null);
        await expect(authorize('noticias')).rejects.toThrow();
    });
});
describe('normalização de formulário', () => {
    it('distingue texto, arquivos, booleanos, números finitos e listas', () => {
        const form = new FormData();
        form.set('text', ' exemplo ');
        form.set('on', 'on');
        form.set('number', '4.5');
        form.set('bad', 'Infinity');
        form.set('list', 'um, dois, , três');
        form.set('file', new Blob(['x']), 'file.txt');
        expect(formString(form, 'text')).toBe('exemplo');
        expect(formString(form, 'file')).toBe('');
        expect(formBoolean(form, 'on')).toBe(true);
        expect(formBoolean(form, 'text')).toBe(false);
        expect(formNumber(form, 'number')).toBe(4.5);
        expect(formNumber(form, 'bad')).toBeNull();
        expect(formNumber(form, 'missing')).toBeNull();
        expect(formList(form, 'list')).toEqual(['um', 'dois', 'três']);
    });
    it('datas inválidas ou ausentes não viram valores persistidos', () => {
        const form = new FormData();
        form.set('date', '2026-09-14');
        form.set('bad', 'não é uma data');
        expect(formDate(form, 'date')?.toISOString()).toBe('2026-09-14T00:00:00.000Z');
        expect(formDate(form, 'bad')).toBeNull();
        expect(formDate(form, 'missing')).toBeNull();
    });
    it.each([
        '2026-02-30',
        '2026-02-29',
        '2026-04-31',
        '2026-13-01',
        '2026-00-01',
        '2026-01-00',
        '2026-10-02T24:00',
        '2026-10-02T09:60',
        '10/02/2026',
        '2026',
        '0000-01-01',
    ])('rejects rolled-over or ambiguous date %s', (value) => {
        const form = new FormData();
        form.set('date', value);
        expect(formDate(form, 'date')).toBeNull();
    });
    it.each([
        '2028-02-29',
        '2026-10-02T09:30',
        '2026-10-02T09:30:45.123Z',
        '2026-10-02T09:30:00-03:00',
    ])('retains supported valid date/timestamp %s', (value) => {
        const form = new FormData();
        form.set('date', value);
        expect(formDate(form, 'date')).toBeInstanceOf(Date);
    });
});
