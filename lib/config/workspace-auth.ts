import { readLocalTestAuth } from './local-test-auth';

/** Pure policy helpers. OAuth verifies signatures; these functions never authenticate a token. */
export function workspaceDomain(value: string | undefined): string | null {
    const domain = value?.trim().toLowerCase() ?? '';
    return domain.length <= 253 &&
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
        ? domain
        : null;
}

export function isWorkspaceEmail(email: string, domain: string | null): boolean {
    if (!domain || email.length > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@]+$/.test(email))
        return false;
    return email.split('@')[1]?.toLowerCase() === domain;
}

export interface WorkspaceIdentity {
    sub: string;
    email: string;
    hd?: string;
    emailVerified: boolean;
}
export function isWorkspaceIdentity(profile: WorkspaceIdentity, domain: string | null): boolean {
    return Boolean(
        domain &&
        profile.hd === domain &&
        profile.emailVerified === true &&
        /^[A-Za-z0-9_-]{1,255}$/.test(profile.sub) &&
        isWorkspaceEmail(profile.email, domain),
    );
}

export interface WorkspaceAccessPolicy {
    allowedEmail: string | null;
    individualMfaConfirmed: boolean;
    mfaSatisfied: boolean;
    valid: boolean;
    errors: string[];
}

/** Operational declarations only: no OAuth claim here proves that a second factor ran. */
export function readWorkspaceAccessPolicy(
    source: Record<string, string | undefined>,
    domain = workspaceDomain(source.GOOGLE_OAUTH_ALLOWED_DOMAIN),
): WorkspaceAccessPolicy {
    const value = (key: string) => source[key]?.trim() ?? '';
    const errors: string[] = [];
    const readSingleEmail = (key: string): string | null => {
        const email = value(key).toLowerCase();
        if (!email) return null;
        if (
            !/^[a-z0-9][a-z0-9._%+-]{0,63}@[^@]+$/.test(email) ||
            !isWorkspaceEmail(email, domain)
        ) {
            errors.push(`${key} deve conter exatamente um e-mail válido do domínio Workspace.`);
            return null;
        }
        return email;
    };
    const allowedEmail = readSingleEmail('GOOGLE_OAUTH_ALLOWED_EMAILS');
    const confirmedEmail = readSingleEmail('GOOGLE_WORKSPACE_MFA_CONFIRMED_EMAILS');
    if (confirmedEmail && (!allowedEmail || confirmedEmail !== allowedEmail))
        errors.push('A confirmação individual de 2FA deve corresponder à única conta autorizada.');
    const globalMfa = value('GOOGLE_WORKSPACE_MFA_ENFORCED');
    if (globalMfa && !['true', 'false'].includes(globalMfa))
        errors.push('GOOGLE_WORKSPACE_MFA_ENFORCED deve ser exatamente true ou false.');
    const cloudRun = Boolean(value('K_SERVICE') || value('K_REVISION'));
    const cloud = ['gcp', 'gcp-vm'].includes(value('DEPLOYMENT_TARGET')) || cloudRun;
    const individualMfaConfirmed = Boolean(
        errors.length === 0 &&
        value('DEPLOYMENT_TARGET') === 'gcp-vm' &&
        !cloudRun &&
        globalMfa === 'false' &&
        allowedEmail &&
        confirmedEmail === allowedEmail,
    );
    const mfaSatisfied = globalMfa === 'true' || individualMfaConfirmed;
    return {
        allowedEmail,
        individualMfaConfirmed,
        mfaSatisfied,
        valid: errors.length === 0 && (!cloud || mfaSatisfied),
        errors,
    };
}

/** Re-evaluated for both login and every authenticated request, including existing sessions. */
export function isWorkspaceAccountAllowed(
    email: string,
    domain: string | null,
    source: Record<string, string | undefined>,
): boolean {
    const policy = readWorkspaceAccessPolicy(source, domain);
    return Boolean(
        policy.valid &&
        isWorkspaceEmail(email, domain) &&
        (!policy.allowedEmail || email.toLowerCase() === policy.allowedEmail),
    );
}

export function inspectWorkspaceAuthEnvironment(source: Record<string, string | undefined>): {
    errors: string[];
    warnings: string[];
} {
    const value = (key: string) => source[key]?.trim() ?? '';
    const errors: string[] = [];
    const warnings: string[] = [];
    const cloud =
        ['gcp', 'gcp-vm'].includes(value('DEPLOYMENT_TARGET')) ||
        Boolean(value('K_SERVICE') || value('K_REVISION'));
    const localTest = readLocalTestAuth(source);
    if (
        value('LOCAL_TEST_AUTH_ENABLED') &&
        !['true', 'false'].includes(source.LOCAL_TEST_AUTH_ENABLED!)
    )
        errors.push('LOCAL_TEST_AUTH_ENABLED deve ser exatamente true ou false.');
    if (source.LOCAL_TEST_AUTH_ENABLED === 'true' && !localTest.enabled)
        errors.push(
            'Acesso local de teste exige DEPLOYMENT_TARGET=local, APP_URL loopback, LOCAL_TEST_AUTH_USER_ID válido e ausência de OAuth/K_SERVICE/K_REVISION. Nunca habilite na nuvem.',
        );
    if (localTest.enabled)
        warnings.push(
            'ACESSO LOCAL DE TESTE ATIVO: autenticação Google/2FA não é usada. Restrinja a máquina e a porta a loopback, nunca exponha por túnel; sessões duram no máximo uma hora.',
        );
    const configured = Boolean(
        value('GOOGLE_OAUTH_CLIENT_ID') || value('GOOGLE_OAUTH_CLIENT_SECRET'),
    );
    if (cloud || configured) {
        if (
            !value('GOOGLE_OAUTH_CLIENT_ID') ||
            !value('GOOGLE_OAUTH_CLIENT_SECRET') ||
            !workspaceDomain(value('GOOGLE_OAUTH_ALLOWED_DOMAIN'))
        )
            errors.push(
                'Acesso exclusivo Workspace exige GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET e GOOGLE_OAUTH_ALLOWED_DOMAIN válidos.',
            );
    } else if (!localTest.enabled)
        warnings.push(
            'Google Workspace não configurado: o painel está indisponível; não existe login alternativo por senha.',
        );
    const accessPolicy = readWorkspaceAccessPolicy(source);
    errors.push(...accessPolicy.errors);
    if (cloud && !accessPolicy.mfaSatisfied)
        errors.push(
            'Confirme 2FA obrigatório no Workspace. HML gcp-vm admite somente uma conta allowlist com confirmação individual idêntica e MFA global explicitamente false. As declarações não verificam MFA no token Google.',
        );
    if (accessPolicy.individualMfaConfirmed)
        warnings.push(
            'HML restrita a uma conta com 2FA individual confirmado pelo responsável. A política global Workspace ainda não está declarada como exigida; o token OAuth não comprova um segundo fator.',
        );
    if (
        value('GOOGLE_OAUTH_ALLOWED_DOMAIN') &&
        !workspaceDomain(value('GOOGLE_OAUTH_ALLOWED_DOMAIN'))
    )
        errors.push(
            'GOOGLE_OAUTH_ALLOWED_DOMAIN deve ser um único domínio institucional, sem URL, wildcard ou lista.',
        );
    for (const key of ['BOOTSTRAP_ADMIN_PASSWORD', 'USER_PASSWORD', 'SEED_ADMIN_PASSWORD'])
        if (value(key))
            errors.push(`${key} não é suportado: o acesso é exclusivamente Google Workspace.`);
    return { errors, warnings };
}
