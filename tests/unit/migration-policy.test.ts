import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertMigrationDeployment, DATABASE_PROTOCOL } from '../../scripts/lib/migration-policy.mjs';
const input = { migrations: [{ name: 'nullable-jobs', strategy: 'expand' }, { name: 'sensitive-rls', strategy: 'contract' }],
    applied: new Set<string>(), mode: 'online', maintenanceConfirmed: false, backupVerified: false, appProtocol: DATABASE_PROTOCOL };

describe('guard real de compatibilidade antes de migração e blue/green', () => {
    it('recusa contract/unknown pendente mesmo se alguém marcou as aprovações de manutenção', () => {
        expect(() => assertMigrationDeployment(input)).toThrow('Online migration blocked');
        expect(() => assertMigrationDeployment({ ...input, maintenanceConfirmed: true, backupVerified: true })).toThrow('Online migration blocked');
        expect(() => assertMigrationDeployment({ ...input, migrations: [{ name: 'unreviewed', strategy: 'unknown' }] })).toThrow('Online migration blocked');
    });
    it('exige ambas confirmações em manutenção e permite apenas após revisão explícita', () => {
        expect(() => assertMigrationDeployment({ ...input, mode: 'maintenance', maintenanceConfirmed: true })).toThrow('verified backup');
        expect(() => assertMigrationDeployment({ ...input, mode: 'maintenance', backupVerified: true })).toThrow('maintenance');
        expect(assertMigrationDeployment({ ...input, mode: 'maintenance', maintenanceConfirmed: true, backupVerified: true })).toHaveLength(2);
    });
    it('mantém rollout online de migrations expand e não bloqueia contract já aplicada', () => {
        expect(assertMigrationDeployment({ ...input, applied: new Set(['sensitive-rls']) })).toEqual([{ name: 'nullable-jobs', strategy: 'expand' }]);
        expect(assertMigrationDeployment({ ...input, applied: new Set(['sensitive-rls', 'nullable-jobs']) })).toEqual([]);
    });
    it('rejeita rollback incompatível mesmo quando não há nenhuma migração pendente', () => {
        const applied = new Set(['sensitive-rls', 'nullable-jobs']);
        expect(() => assertMigrationDeployment({ ...input, applied, appProtocol: '' })).toThrow('Application database protocol incompatible');
        expect(() => assertMigrationDeployment({ ...input, applied, appProtocol: 'unscoped-v0' })).toThrow('Application database protocol incompatible');
        expect(assertMigrationDeployment({ ...input, applied })).toEqual([]);
    });
    it('rejeita migrador antigo que desconhece história já aplicada', () => {
        expect(() => assertMigrationDeployment({ ...input, applied: new Set(['future-applied-migration']) })).toThrow('Migration history incompatible');
    });
    it('labels dos dois targets imutáveis correspondem à capability compilada', () => {
        const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
        for (const target of ['migrator', 'runner']) {
            const stage = dockerfile.split(`FROM base AS ${target}`)[1].split('FROM base AS ')[0];
            expect(stage).toContain(`LABEL org.spmnacional.database-protocol="${DATABASE_PROTOCOL}"`);
        }
    });
});
