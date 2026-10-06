import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/server/auth';

const mocks = vi.hoisted(() => ({
    user: null as SessionUser | null,
    find: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    createReferral: vi.fn(),
    findRegional: vi.fn(),
    allocateCode: vi.fn(),
    createCase: vi.fn(),
    audit: vi.fn(),
    origin: vi.fn(),
    parentLock: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({
    getCurrentUser: async () => mocks.user,
    hasPermission: (user: SessionUser | null, permission: string) =>
        Boolean(user?.permissions.includes(permission)),
}));
vi.mock('@/lib/server/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('@/lib/server/request-origin', async (original) => ({
    ...(await original<object>()),
    assertTrustedMutationOrigin: mocks.origin,
}));
vi.mock('@/lib/server/db', () => ({
    prisma: {
        atendimento: {
            findFirst: mocks.find,
            updateMany: mocks.update,
            count: mocks.count,
            create: mocks.createCase,
        },
        regional: { findUnique: mocks.findRegional },
        $queryRaw: mocks.allocateCode,
        atendimentoEncaminhamento: { create: mocks.createReferral },
        $transaction: async (body: (tx: unknown) => Promise<unknown>) =>
            body({
                $queryRaw: mocks.parentLock,
                atendimentoEncaminhamento: { create: mocks.createReferral },
            }),
    },
    withActorDatabaseScope: async (_user: SessionUser, body: () => unknown) => body(),
}));
import {
    anonimizarAtendimento,
    atualizarAtendimento,
    criarAtendimento,
    registrarEncaminhamento,
} from '@/app/admin/atendimentos/actions';

const regionalUser = (): SessionUser => ({
    id: 'operator-a',
    name: 'Operador',
    email: 'operator@example.test',
    initials: 'OP',
    status: 'ATIVO',
    role: { id: 'role-a', key: 'atendente', name: 'Atendente' },
    regionalId: 'regional-a',
    regionalName: 'Regional A',
    permissions: ['atendimentos'],
    mustChangePassword: false,
});
const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = regionalUser();
    mocks.origin.mockResolvedValue(undefined);
    mocks.find.mockResolvedValue({
        id: 'case-a',
        codigo: 'ATD-TEST',
        status: 'ABERTO',
        retencaoAte: new Date('2027-10-02'),
        encerradoEm: null,
        regional: { name: 'Regional A' },
    });
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.count.mockResolvedValue(1);
    mocks.parentLock.mockResolvedValue([{ id: 'case-a' }]);
    mocks.findRegional.mockResolvedValue({ id: 'regional-a', name: 'Regional A' });
    mocks.allocateCode.mockResolvedValue([{ value: 42n }]);
    mocks.createCase.mockImplementation(async ({ data }) => ({
        id: 'new-case',
        codigo: data.codigo,
    }));
});

const newCase = (overrides: Record<string, string> = {}) =>
    form({
        regionalId: 'regional-a',
        nome: 'Pessoa sintética',
        contato: 'Contato sintético',
        faixaEtaria: 'ADULTO',
        genero: 'NAO_INFORMADO',
        paisOrigem: '',
        idiomas: '',
        chegadaAno: '',
        necessidades: 'ACOLHIDA',
        observacoes: '',
        retencaoAte: '2028-10-02',
        ...overrides,
    });

describe('server-side scope at every sensitive write', () => {
    it('allocates the global code and ignores caller-controlled identifiers on creation', async () => {
        const result = await criarAtendimento(
            { ok: false },
            newCase({
                id: 'caller-id',
                codigo: 'caller-code',
                abertoPorId: 'another-user',
                nomeEncrypted: 'caller-ciphertext',
                status: 'ENCERRADO',
            }),
        );
        expect(result.ok).toBe(true);
        expect(mocks.allocateCode).toHaveBeenCalledOnce();
        expect(mocks.allocateCode.mock.calls[0][0].join('')).toContain('nextval');
        expect(mocks.count).not.toHaveBeenCalled();
        const write = mocks.createCase.mock.calls[0][0].data;
        expect(write.codigo).toMatch(/^ATD-\d{4}-0042$/);
        expect(write.regionalId).toBe('regional-a');
        expect(write.abertoPorId).toBe('operator-a');
        expect(write.nomeEncrypted).toBeTruthy();
        expect(write.nomeEncrypted).not.toBe('Pessoa sintética');
        expect(write.nomeEncrypted).not.toBe('caller-ciphertext');
        expect(write).not.toHaveProperty('id');
        expect(write).not.toHaveProperty('status');
        expect(mocks.allocateCode.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.createCase.mock.invocationCallOrder[0],
        );
    });
    it('rejects another regional before allocating a code or creating a case', async () => {
        const result = await criarAtendimento({ ok: false }, newCase({ regionalId: 'regional-b' }));
        expect(result.ok).toBe(false);
        expect(mocks.findRegional).not.toHaveBeenCalled();
        expect(mocks.allocateCode).not.toHaveBeenCalled();
        expect(mocks.createCase).not.toHaveBeenCalled();
    });
    it('rejects impossible retention dates before database access', async () => {
        const result = await criarAtendimento(
            { ok: false },
            newCase({ retencaoAte: '2028-02-30' }),
        );
        expect(result.ok).toBe(false);
        expect(result.fieldErrors?.retencaoAte).toBeTruthy();
        expect(mocks.findRegional).not.toHaveBeenCalled();
        expect(mocks.allocateCode).not.toHaveBeenCalled();
        expect(mocks.createCase).not.toHaveBeenCalled();
    });
    it('does not query or mutate a case without authenticated permission', async () => {
        mocks.user = null;
        const result = await atualizarAtendimento(
            { ok: false },
            form({ id: 'case-a', status: 'ENCERRADO', retencaoAte: '2028-10-02' }),
        );
        expect(result.ok).toBe(false);
        expect(mocks.find).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it.each(['update', 'anonymize', 'referral'])(
        'denies a case outside the regional scope: %s',
        async (operation) => {
            mocks.find.mockResolvedValue(null);
            const data = form({
                id: 'case-b',
                atendimentoId: 'case-b',
                status: 'ENCERRADO',
                retencaoAte: '2028-10-02',
                confirmar: 'true',
                orgao: 'Serviço',
                descricao: 'Encaminhamento de teste',
            });
            const result =
                operation === 'update'
                    ? await atualizarAtendimento({ ok: false }, data)
                    : operation === 'anonymize'
                      ? await anonimizarAtendimento({ ok: false }, data)
                      : await registrarEncaminhamento({ ok: false }, data);
            expect(result.ok).toBe(false);
            expect(mocks.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 'case-b', regionalId: 'regional-a' } }),
            );
            expect(mocks.update).not.toHaveBeenCalled();
            expect(mocks.createReferral).not.toHaveBeenCalled();
        },
    );
    it('ignores forbidden fields and repeats the regional predicate on update', async () => {
        const result = await atualizarAtendimento(
            { ok: false },
            form({
                id: 'case-a',
                status: 'ENCERRADO',
                retencaoAte: '2028-10-02',
                regionalId: 'regional-b',
                nomeEncrypted: 'attacker-value',
                abertoPorId: 'another-user',
                codigo: 'changed-code',
            }),
        );
        expect(result.ok).toBe(true);
        const write = mocks.update.mock.calls[0][0];
        expect(write.where).toEqual({ id: 'case-a', regionalId: 'regional-a' });
        expect(Object.keys(write.data).sort()).toEqual(['encerradoEm', 'retencaoAte', 'status']);
    });
    it.each(['update', 'anonymize'])(
        'does not claim success after concurrent removal from scope: %s',
        async (operation) => {
            mocks.update.mockResolvedValue({ count: 0 });
            const data = form({
                id: 'case-a',
                status: 'ENCERRADO',
                retencaoAte: '2028-10-02',
                confirmar: 'true',
            });
            const result =
                operation === 'update'
                    ? await atualizarAtendimento({ ok: false }, data)
                    : await anonimizarAtendimento({ ok: false }, data);
            expect(result.ok).toBe(false);
            expect(result.message).toContain('escopo');
            expect(mocks.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 'case-a', regionalId: 'regional-a' } }),
            );
            expect(mocks.audit).not.toHaveBeenCalled();
        },
    );
    it('rejects a forged mutation origin before case access', async () => {
        const { UntrustedOriginError } = await import('@/lib/server/request-origin');
        mocks.origin.mockRejectedValue(new UntrustedOriginError());
        const result = await anonimizarAtendimento(
            { ok: false },
            form({ id: 'case-a', confirmar: 'true' }),
        );
        expect(result.ok).toBe(false);
        expect(mocks.find).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('rechecks and locks the parent before inserting a referral', async () => {
        const result = await registrarEncaminhamento(
            { ok: false },
            form({
                atendimentoId: 'case-a',
                orgao: 'Serviço',
                descricao: 'Encaminhamento de teste',
            }),
        );
        expect(result.ok).toBe(true);
        expect(mocks.parentLock).toHaveBeenCalledOnce();
        expect(mocks.parentLock.mock.calls[0][0].join('')).toContain('FOR UPDATE');
        expect(mocks.parentLock.mock.calls[0][1]).toBe('case-a');
        expect(mocks.parentLock.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.createReferral.mock.invocationCallOrder[0],
        );
        expect(mocks.createReferral).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    atendimentoId: 'case-a',
                    registradoPor: 'Operador',
                }),
            }),
        );
    });
    it('does not insert a referral after the parent is concurrently removed from scope', async () => {
        mocks.parentLock.mockResolvedValue([]);
        const result = await registrarEncaminhamento(
            { ok: false },
            form({
                atendimentoId: 'case-a',
                orgao: 'Serviço',
                descricao: 'Encaminhamento de teste',
            }),
        );
        expect(result.ok).toBe(false);
        expect(mocks.createReferral).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });
});
