import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/lib/generated/prisma/client';
import {
    bootstrapProduction,
    provisionAccount,
    validateAccountInput,
} from '../../scripts/lib/account-provisioning';

vi.mock('@/lib/server/crypto', () => ({
    hashPassword: vi.fn(async () => 'scrypt:hashed-not-plaintext'),
}));
const input = {
    email: 'admin@example.test',
    workspaceDomain: 'example.test',
    name: 'Admin Teste',
};
function fixture() {
    const tx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        user: {
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'u-1' }),
            update: vi.fn().mockResolvedValue({ id: 'u-1' }),
        },
        permission: { upsert: vi.fn().mockResolvedValue({}) },
        role: {
            upsert: vi.fn().mockImplementation(async (args: { where: { key: string } }) => ({
                id: `role-${args.where.key}`,
            })),
            findUnique: vi.fn().mockResolvedValue({ id: 'role-leitura', key: 'leitura' }),
        },
        rolePermission: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        regional: { findUnique: vi.fn().mockResolvedValue(null) },
        session: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const transaction = vi.fn(async (body: (transaction: typeof tx) => Promise<unknown>) =>
        body(tx),
    );
    return { tx, transaction, db: { $transaction: transaction } as unknown as PrismaClient };
}
beforeEach(() => vi.clearAllMocks());

describe('bootstrap mínimo de produção', () => {
    it('cria só permissões, perfis e um administrador Workspace sem senha', async () => {
        const { db, tx, transaction } = fixture();
        expect(await bootstrapProduction(db, input)).toEqual({ userId: 'u-1' });
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(tx.$executeRaw.mock.calls[0][0].join('')).toBe(
            'LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE',
        );
        expect(tx.permission.upsert).toHaveBeenCalledTimes(6);
        expect(tx.role.upsert).toHaveBeenCalledTimes(5);
        expect(tx.rolePermission.createMany).toHaveBeenCalledTimes(4);
        expect(tx.user.create).toHaveBeenCalledTimes(1);
        expect(tx.user.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                email: input.email,
                roleId: 'role-admin',
                initials: 'AT',
                status: 'ATIVO',
                passwordHash: null,
            }),
            select: { id: true },
        });
        expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
            mfaRequired: true,
            passwordHash: null,
        });
        expect(tx.regional.findUnique).not.toHaveBeenCalled();
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
    it('recusa reexecução sem sobrescrever contas ou perfis', async () => {
        const { db, tx } = fixture();
        tx.user.count.mockResolvedValue(1);
        await expect(bootstrapProduction(db, input)).rejects.toThrow('já existem usuários');
        expect(tx.permission.upsert).not.toHaveBeenCalled();
        expect(tx.user.update).not.toHaveBeenCalled();
        expect(tx.user.create).not.toHaveBeenCalled();
    });
    it('exige e-mail institucional antes da transação', async () => {
        const { db, transaction } = fixture();
        await expect(bootstrapProduction(db, { ...input, email: 'admin' })).rejects.toThrow();
        await expect(
            bootstrapProduction(db, { ...input, email: 'person@outside.example' }),
        ).rejects.toThrow();
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe('provisionamento CLI explícito e seguro', () => {
    it('não concede administrador quando perfil foi omitido', async () => {
        const { db, tx } = fixture();
        expect(await provisionAccount(db, input)).toEqual({ created: true, revokedSessions: 2 });
        expect(tx.role.findUnique).toHaveBeenCalledWith({ where: { key: 'leitura' } });
    });
    it('não redefine conta existente sem --atualizar', async () => {
        const { db, tx } = fixture();
        tx.user.findUnique.mockResolvedValue({ id: 'u-1', role: { key: 'editor' } });
        await expect(provisionAccount(db, input)).rejects.toThrow('--atualizar');
        expect(tx.user.update).not.toHaveBeenCalled();
        expect(tx.session.updateMany).not.toHaveBeenCalled();
    });
    it('preserva perfil, nome e regional omitidos na atualização e revoga sessões', async () => {
        const { db, tx } = fixture();
        tx.user.findUnique.mockResolvedValue({
            id: 'u-1',
            name: 'Nome existente',
            role: { key: 'editor' },
        });
        tx.role.findUnique.mockResolvedValue({ id: 'role-editor', key: 'editor' });
        expect(
            await provisionAccount(db, {
                email: input.email,
                workspaceDomain: input.workspaceDomain,
                updateExisting: true,
            }),
        ).toEqual({ created: false, revokedSessions: 2 });
        expect(tx.role.findUnique).toHaveBeenCalledWith({ where: { key: 'editor' } });
        expect(tx.user.update).toHaveBeenCalledWith({
            where: { id: 'u-1' },
            data: expect.objectContaining({
                name: 'Nome existente',
                roleId: 'role-editor',
                resetTokenHash: null,
            }),
            select: { id: true },
        });
        expect(tx.user.update.mock.calls[0][0].data).not.toHaveProperty('regionalId');
        expect(tx.session.updateMany).toHaveBeenCalledWith({
            where: { userId: 'u-1', revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
    });
    it('preserva o último administrador ativo', async () => {
        const { db, tx } = fixture();
        tx.user.findUnique.mockResolvedValue({
            id: 'u-1',
            status: 'ATIVO',
            role: { key: 'admin' },
        });
        tx.user.count.mockResolvedValue(1);
        await expect(
            provisionAccount(db, { ...input, updateExisting: true, roleKey: 'leitura' }),
        ).rejects.toThrow('último administrador');
        expect(tx.user.update).not.toHaveBeenCalled();
    });
    it('rejeita regional inexistente sem criar conta', async () => {
        const { db, tx } = fixture();
        await expect(
            provisionAccount(db, { ...input, regionalSlug: 'nao-existe' }),
        ).rejects.toThrow('Regional não encontrada');
        expect(tx.user.create).not.toHaveBeenCalled();
    });
});

describe('validação de entrada da manutenção', () => {
    it('normaliza e-mail institucional', () => {
        expect(validateAccountInput({ ...input, email: '  EQUIPE@example.test ' }).email).toBe(
            'equipe@example.test',
        );
    });
    it.each([
        'admin',
        'person@gmail.com',
        'person@example.test.evil.test',
        'person@sub.example.test',
        'person@@example.test',
    ])('rejeita endereço fora do domínio: %s', (email) => {
        expect(() => validateAccountInput({ ...input, email })).toThrow();
    });
    it('nega domínio ausente ou wildcard', () => {
        expect(() => validateAccountInput({ ...input, workspaceDomain: '' })).toThrow();
        expect(() =>
            validateAccountInput({ ...input, workspaceDomain: '*.example.test' }),
        ).toThrow();
    });
});
