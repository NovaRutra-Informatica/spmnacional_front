import { describe, expect, it } from 'vitest';
import {
    inspectWorkspaceAuthEnvironment,
    isWorkspaceAccountAllowed,
    isWorkspaceEmail,
    readWorkspaceAccessPolicy,
    workspaceDomain,
} from '@/lib/config/workspace-auth';
describe('configuração Workspace fail-closed', () => {
    it.each([
        '',
        '*.example.test',
        'example.test,other.test',
        'https://example.test',
        'x..test',
        '-x.test',
    ])('nega domínio inválido %j', (value) => {
        expect(workspaceDomain(value)).toBeNull();
    });
    it('normaliza domínio e recusa sufixos/aliases de outro domínio', () => {
        expect(workspaceDomain(' EXAMPLE.TEST ')).toBe('example.test');
        expect(isWorkspaceEmail('a@example.test', 'example.test')).toBe(true);
        expect(isWorkspaceEmail('a@other.example.test', 'example.test')).toBe(false);
        expect(isWorkspaceEmail('a@example.test.evil', 'example.test')).toBe(false);
    });
    it('sem OAuth local informa indisponibilidade e não cria fallback', () => {
        const report = inspectWorkspaceAuthEnvironment({});
        expect(report.errors).toEqual([]);
        expect(report.warnings.join(' ')).toContain('não existe login alternativo');
    });
    it.each(['gcp', 'gcp-vm'])(
        '%s exige OAuth e confirmação operacional da política 2FA',
        (target) => {
            expect(
                inspectWorkspaceAuthEnvironment({ DEPLOYMENT_TARGET: target }).errors,
            ).toHaveLength(2);
            expect(
                inspectWorkspaceAuthEnvironment({
                    DEPLOYMENT_TARGET: target,
                    GOOGLE_OAUTH_CLIENT_ID: 'id',
                    GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
                    GOOGLE_OAUTH_ALLOWED_DOMAIN: 'example.test',
                    GOOGLE_WORKSPACE_MFA_ENFORCED: 'true',
                }).errors,
            ).toEqual([]);
        },
    );
    it('recusa credenciais parciais e senhas locais', () => {
        expect(
            inspectWorkspaceAuthEnvironment({ GOOGLE_OAUTH_CLIENT_ID: 'id' }).errors,
        ).not.toEqual([]);
        expect(
            inspectWorkspaceAuthEnvironment({ USER_PASSWORD: 'never-print-this' }).errors.join(' '),
        ).not.toContain('never-print-this');
        expect(inspectWorkspaceAuthEnvironment({ USER_PASSWORD: 'x' }).errors).toHaveLength(1);
    });
});

const singleAccountHml = {
    DEPLOYMENT_TARGET: 'gcp-vm',
    GOOGLE_OAUTH_CLIENT_ID: 'id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
    GOOGLE_OAUTH_ALLOWED_DOMAIN: 'example.test',
    GOOGLE_WORKSPACE_MFA_ENFORCED: 'false',
    GOOGLE_OAUTH_ALLOWED_EMAILS: 'admin@example.test',
    GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS: 'admin@example.test',
};

describe('exceção HML de confirmação individual 2FA', () => {
    it('aceita somente a conta única confirmada na VM, sem declarar política global', () => {
        const policy = readWorkspaceAccessPolicy(singleAccountHml);
        expect(policy).toMatchObject({
            valid: true,
            allowedEmail: 'admin@example.test',
            individualMfaConfirmed: true,
            mfaSatisfied: true,
        });
        expect(singleAccountHml.GOOGLE_WORKSPACE_MFA_ENFORCED).toBe('false');
        expect(inspectWorkspaceAuthEnvironment(singleAccountHml).errors).toEqual([]);
        expect(inspectWorkspaceAuthEnvironment(singleAccountHml).warnings.join(' ')).toContain(
            'token OAuth não comprova',
        );
        expect(
            isWorkspaceAccountAllowed('admin@example.test', 'example.test', singleAccountHml),
        ).toBe(true);
        expect(
            isWorkspaceAccountAllowed('other@example.test', 'example.test', singleAccountHml),
        ).toBe(false);
    });
    it.each([
        { GOOGLE_OAUTH_ALLOWED_EMAILS: undefined },
        { GOOGLE_OAUTH_ALLOWED_EMAILS: '' },
        { GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS: undefined },
        { GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS: '' },
        { GOOGLE_WORKSPACE_MFA_ENFORCED: undefined },
        { GOOGLE_WORKSPACE_MFA_ENFORCED: 'yes' },
        { GOOGLE_OAUTH_ALLOWED_EMAILS: 'admin@example.test,other@example.test' },
        { GOOGLE_OAUTH_ALLOWED_EMAILS: 'admin@example.test;other@example.test' },
        { GOOGLE_OAUTH_ALLOWED_EMAILS: '*@example.test' },
        { GOOGLE_OAUTH_ALLOWED_EMAILS: 'admin@other.test' },
        { GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS: 'other@example.test' },
        { GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS: 'admin@example.test,other@example.test' },
        { GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS: 'admin@example.test\nother@example.test' },
    ])('falha fechado com declaração incompleta/malformada: %j', (override) => {
        const source = { ...singleAccountHml, ...override };
        expect(readWorkspaceAccessPolicy(source).valid).toBe(false);
        expect(inspectWorkspaceAuthEnvironment(source).errors.length).toBeGreaterThan(0);
        expect(isWorkspaceAccountAllowed('admin@example.test', 'example.test', source)).toBe(false);
    });
    it.each([
        { DEPLOYMENT_TARGET: 'gcp' },
        { K_SERVICE: 'spm-run' },
        { K_REVISION: 'spm-run-00001' },
    ])('Cloud Run não aceita confirmação individual: %j', (override) => {
        const source = { ...singleAccountHml, ...override };
        expect(readWorkspaceAccessPolicy(source).individualMfaConfirmed).toBe(false);
        expect(inspectWorkspaceAuthEnvironment(source).errors.length).toBeGreaterThan(0);
        expect(isWorkspaceAccountAllowed('admin@example.test', 'example.test', source)).toBe(false);
    });
    it('preserva a política global e aplica uma allowlist quando fornecida', () => {
        const global = {
            DEPLOYMENT_TARGET: 'gcp',
            GOOGLE_OAUTH_ALLOWED_DOMAIN: 'example.test',
            GOOGLE_WORKSPACE_MFA_ENFORCED: 'true',
        };
        expect(isWorkspaceAccountAllowed('other@example.test', 'example.test', global)).toBe(true);
        expect(
            isWorkspaceAccountAllowed('other@example.test', 'example.test', {
                ...global,
                GOOGLE_OAUTH_ALLOWED_EMAILS: 'admin@example.test',
            }),
        ).toBe(false);
        expect(
            readWorkspaceAccessPolicy({
                ...global,
                GOOGLE_OAUTH_ALLOWED_EMAILS: 'admin@example.test,other@example.test',
            }).valid,
        ).toBe(false);
    });
});
