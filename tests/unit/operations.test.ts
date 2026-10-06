import { describe, expect, it, vi, afterEach } from 'vitest';
import { logError } from '../../lib/server/logger';
import {
    escopoAtendimento,
    escopoRegional,
    retencaoPadrao,
    retencaoVencida,
    validarRetencao,
} from '../../app/admin/atendimentos/politica';
import type { SessionUser } from '../../lib/server/auth';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../lib/server/db', () => ({ prisma: { $queryRaw: query } }));
import { databaseReady } from '../../lib/server/health';
const user = { role: { key: 'regional' }, regionalId: 'regional-a' } as SessionUser;
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});
describe('operação e isolamento regional', () => {
    it('logs não serializam PII, stack, tokens ou campos desconhecidos', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        logError(
            'database.failed',
            Object.assign(new Error('senha=SEGREDO; dados pessoais'), { code: 'P2002' }),
            { email: 'person@example.org', status: 503, requestId: 'valid-id' },
        );
        const line = spy.mock.calls[0][0];
        expect(JSON.parse(line)).toMatchObject({ severity: 'ERROR', code: 'P2002', status: 503 });
        expect(line).not.toMatch(/SEGREDO|pessoais|person@example|stack/);
        logError('bad event\nINJECTION', null);
        expect(spy.mock.calls[1][0]).toContain('application.error');
    });
    it('readiness recupera sucesso e falha sem detalhes internos', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        query
            .mockResolvedValueOnce([{ ready: true }])
            .mockRejectedValueOnce(new Error('DB password'));
        expect(await databaseReady()).toBe(true);
        expect(await databaseReady()).toBe(false);
    });
    it('readiness não aceita SELECT1, protocolo incompleto ou RLS desabilitada como conectividade suficiente', async () => {
        query.mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce([{ ready: false }]).mockResolvedValueOnce([]);
        expect(await databaseReady()).toBe(false);
        expect(await databaseReady()).toBe(false);
        expect(await databaseReady()).toBe(false);
    });
    it('readiness tem prazo limitado mesmo se o driver travar', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        query.mockReturnValue(new Promise(() => {}));
        const result = databaseReady();
        await vi.advanceTimersByTimeAsync(3001);
        expect(await result).toBe(false);
    });
    it('nega fichas sem regional e limita operadores à própria regional', () => {
        expect(escopoAtendimento(user)).toEqual({ regionalId: 'regional-a' });
        expect(escopoAtendimento({ ...user, regionalId: null })).toEqual({ id: { in: [] } });
        expect(escopoAtendimento({ ...user, role: { ...user.role, key: 'admin' } })).toEqual({});
        expect(escopoRegional(user)).toEqual({ id: 'regional-a' });
        expect(escopoRegional({ ...user, regionalId: null })).toEqual({ id: { in: [] } });
        expect(escopoRegional({ ...user, role: { ...user.role, key: 'admin' } })).toEqual({
            active: true,
        });
    });
    it('rejeita retenção inválida e além do limite', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
        expect(validarRetencao(null, { permitirPassado: false })).not.toBeNull();
        expect(validarRetencao(new Date('invalid'), { permitirPassado: false })).not.toBeNull();
        expect(validarRetencao(new Date('2000-01-01'), { permitirPassado: false })).not.toBeNull();
        expect(validarRetencao(new Date('2050-01-01'), { permitirPassado: true })).not.toBeNull();
        expect(validarRetencao(new Date('2000-01-01'), { permitirPassado: true })).toBeNull();
        expect(retencaoPadrao().toISOString()).toBe('2031-09-14T00:00:00.000Z');
        expect(retencaoVencida(new Date('2020-01-01'))).toBe(true);
    });
});
