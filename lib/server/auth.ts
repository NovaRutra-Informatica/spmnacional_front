import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './db';
import { generateToken, hashToken } from './crypto';
import { recordAudit, requestMeta } from './audit';
import { consumeRateLimit } from './rate-limit';
import { isSessionToken } from './auth-security';
import { assertTrustedMutationOrigin } from './request-origin';
import { env } from './env';
import {
    isWorkspaceEmail,
    isWorkspaceAccountAllowed,
    isWorkspaceIdentity,
    workspaceDomain,
    type WorkspaceIdentity,
} from '@/lib/config/workspace-auth';
import { isLocalTestRequest, readLocalTestAuth } from '@/lib/config/local-test-auth';

export const SESSION_COOKIE =
    process.env.NODE_ENV === 'production' ? '__Host-spm_session' : 'spm_session';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const LOCAL_TEST_SESSION_MAX_AGE_MS = 60 * 60 * 1000;
const LOCAL_TEST_DENIED = 'O acesso local de teste não está disponível para esta solicitação.';
const DENIED = 'Esta conta Google Workspace não está autorizada para este acesso.';
export const PASSWORD_DISABLED =
    'O acesso é exclusivo pela conta institucional do Google Workspace.';
export interface SessionUser {
    id: string;
    name: string;
    email: string;
    initials: string;
    status: string;
    role: { id: string; key: string; name: string };
    regionalId: string | null;
    regionalName: string | null;
    permissions: string[];
    mustChangePassword: boolean;
}
// Private: callers must first pass the complete Workspace or local-only policy.
async function issueSession(
    userId: string,
    identity:
        | { authMethod: 'GOOGLE_WORKSPACE'; sub: string; domain: string }
        | { authMethod: 'LOCAL_TEST' },
): Promise<void> {
    const token = generateToken(32);
    const meta = await requestMeta();
    const maxAge =
        identity.authMethod === 'LOCAL_TEST' ? LOCAL_TEST_SESSION_MAX_AGE_MS : SESSION_MAX_AGE_MS;
    const createdAt = new Date();
    await prisma.session.create({
        data: {
            tokenHash: hashToken(token),
            userId,
            ip: meta.ip,
            userAgent: meta.userAgent,
            createdAt,
            expiresAt: new Date(createdAt.getTime() + maxAge),
            authMethod: identity.authMethod,
            googleSub: identity.authMethod === 'GOOGLE_WORKSPACE' ? identity.sub : null,
            workspaceDomain: identity.authMethod === 'GOOGLE_WORKSPACE' ? identity.domain : null,
        },
    });
    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: Math.floor(maxAge / 1000),
        priority: 'high',
    });
}
export async function destroySession(): Promise<void> {
    await assertTrustedMutationOrigin();
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (isSessionToken(token))
        await prisma.session.updateMany({
            where: { tokenHash: hashToken(token), revokedAt: null },
            data: { revokedAt: new Date() },
        });
    // Expiring a __Host- cookie must preserve Secure and Path=/; a generic
    // delete without those attributes can be rejected by the browser.
    store.set(SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        priority: 'high',
    });
}
export async function revokeAllSessions(userId: string): Promise<void> {
    await prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
}
function toSessionUser(user: {
    id: string;
    name: string;
    email: string;
    initials: string;
    status: string;
    regionalId: string | null;
    regional: { name: string } | null;
    role: { id: string; key: string; name: string; permissions: { permissionKey: string }[] };
}): SessionUser {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        initials: user.initials,
        status: user.status,
        role: { id: user.role.id, key: user.role.key, name: user.role.name },
        regionalId: user.regionalId,
        regionalName: user.regional?.name ?? null,
        permissions: user.role.permissions.map((p) => p.permissionKey),
        mustChangePassword: false,
    };
}
export async function getCurrentUser(
    options: { touch?: boolean } = {},
): Promise<SessionUser | null> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    const domain = workspaceDomain(env.google.allowedDomain);
    const localTest = readLocalTestAuth(process.env);
    if (!isSessionToken(token) || (!domain && !localTest.enabled)) return null;
    const session = await prisma.session
        .findUnique({
            where: { tokenHash: hashToken(token) },
            include: {
                user: {
                    include: {
                        regional: { select: { name: true } },
                        role: { include: { permissions: { select: { permissionKey: true } } } },
                    },
                },
            },
        })
        .catch(() => null);
    if (!session || session.revokedAt || session.user.status !== 'ATIVO') return null;
    const now = Date.now();
    if (session.authMethod === 'LOCAL_TEST') {
        if (
            !localTest.enabled ||
            session.userId !== localTest.userId ||
            session.user.id !== localTest.userId ||
            !isLocalTestRequest(await headers(), process.env) ||
            session.googleSub !== null ||
            session.workspaceDomain !== null ||
            session.createdAt.getTime() > now ||
            now - session.createdAt.getTime() >= LOCAL_TEST_SESSION_MAX_AGE_MS ||
            session.expiresAt.getTime() - session.createdAt.getTime() >
                LOCAL_TEST_SESSION_MAX_AGE_MS
        )
            return null;
    } else if (
        session.authMethod !== 'GOOGLE_WORKSPACE' ||
        !domain ||
        session.workspaceDomain !== domain ||
        !session.googleSub ||
        session.googleSub !== session.user.googleSub ||
        !isWorkspaceEmail(session.user.email, domain) ||
        !isWorkspaceAccountAllowed(session.user.email, domain, process.env)
    )
        return null;
    if (session.expiresAt.getTime() <= now) return null;
    if (now - session.lastSeenAt.getTime() >= SESSION_IDLE_MS) {
        await prisma.session
            .update({ where: { id: session.id }, data: { revokedAt: new Date() } })
            .catch(() => undefined);
        return null;
    }
    if (options.touch !== false && now - session.lastSeenAt.getTime() > 60_000) {
        await prisma.session
            .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
            .catch(() => undefined);
        await prisma.user
            .update({ where: { id: session.userId }, data: { lastAccessAt: new Date() } })
            .catch(() => undefined);
    }
    return toSessionUser(session.user);
}
export async function requireUser(): Promise<SessionUser> {
    const user = await getCurrentUser();
    if (!user) redirect('/atendente');
    return user;
}
export function hasPermission(user: SessionUser | null, permission: string): boolean {
    return Boolean(user?.permissions.includes(permission));
}
export async function requirePermission(permission: string): Promise<SessionUser> {
    const user = await requireUser();
    if (!hasPermission(user, permission))
        redirect(`/admin?erro=permissao&recurso=${encodeURIComponent(permission)}`);
    return user;
}
export type LoginResult = { ok: true; user: SessionUser } | { ok: false; error: string };
/** Legacy entry point intentionally denies every request, even if a password hash exists. */
export async function loginWithPassword(_email: string, _password: string): Promise<LoginResult> {
    void _email;
    void _password;
    return { ok: false, error: PASSWORD_DISABLED };
}
async function registerAttempt(email: string, success: boolean, reason: string): Promise<void> {
    const meta = await requestMeta();
    await prisma.loginAttempt
        .create({ data: { email, ip: meta.ip, success, reason } })
        .catch(() => undefined);
}

/** Reveals only the configured, active local account; never searches by a form field. */
export async function getLocalTestAccount(): Promise<{ name: string; email: string } | null> {
    const localTest = readLocalTestAuth(process.env);
    if (!localTest.enabled || !isLocalTestRequest(await headers(), process.env)) return null;
    const user = await prisma.user
        .findUnique({
            where: { id: localTest.userId! },
            select: { id: true, name: true, email: true, status: true },
        })
        .catch(() => null);
    return user?.status === 'ATIVO' && user.id === localTest.userId
        ? { name: user.name, email: user.email }
        : null;
}

/** Temporary loopback-only test access. This function is not exposed as a GET route. */
export async function loginWithLocalTestAccount(): Promise<LoginResult> {
    const localTest = readLocalTestAuth(process.env);
    if (!localTest.enabled || !isLocalTestRequest(await headers(), process.env))
        return { ok: false, error: LOCAL_TEST_DENIED };
    await assertTrustedMutationOrigin();
    const rate = await consumeRateLimit({
        scope: 'local-test-login',
        identifier: 'configured-account',
        limit: 10,
        windowMs: 15 * 60_000,
    });
    if (!rate.allowed) return { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' };
    const user = await prisma.user.findUnique({
        where: { id: localTest.userId! },
        include: {
            regional: { select: { name: true } },
            role: { include: { permissions: { select: { permissionKey: true } } } },
        },
    });
    if (!user || user.status !== 'ATIVO' || user.id !== localTest.userId) {
        await registerAttempt('local-test', false, 'LOCAL_TEST');
        await recordAudit({
            action: 'Acesso local de teste recusado',
            target: 'Painel administrativo local',
            level: 'ALERTA',
            actorLabel: 'local-test',
            metadata: { reason: 'LOCAL_TEST' },
        });
        return { ok: false, error: LOCAL_TEST_DENIED };
    }
    await issueSession(user.id, { authMethod: 'LOCAL_TEST' });
    await registerAttempt(user.email, true, 'LOCAL_TEST');
    await recordAudit({
        action: 'Acesso local de teste iniciado sem Google',
        target: 'Painel administrativo local',
        level: 'ALERTA',
        userId: user.id,
        actorLabel: user.email,
        metadata: { reason: 'LOCAL_TEST' },
    });
    return { ok: true, user: toSessionUser(user) };
}
/** Called only after signature, issuer, audience, nonce and PKCE verification by OAuth callback. */
export async function loginWithGoogleProfile(
    profile: WorkspaceIdentity & { name?: string },
): Promise<LoginResult> {
    const domain = workspaceDomain(env.google.allowedDomain);
    if (
        !isWorkspaceIdentity(profile, domain) ||
        !isWorkspaceAccountAllowed(profile.email, domain, process.env)
    )
        return { ok: false, error: DENIED };
    const normalized = profile.email.toLowerCase();
    const globalRate = await consumeRateLimit({
        scope: 'workspace-login-global',
        identifier: 'all',
        limit: 300,
        windowMs: 15 * 60_000,
    });
    if (!globalRate.allowed)
        return { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' };
    const accountRate = await consumeRateLimit({
        scope: 'workspace-login-account',
        identifier: normalized,
        limit: 20,
        windowMs: 15 * 60_000,
    });
    if (!accountRate.allowed)
        return { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' };
    const linkedAccount = await prisma.user.findUnique({
        where: { googleSub: profile.sub },
        select: { id: true, email: true },
    });
    if (linkedAccount && linkedAccount.email.toLowerCase() !== normalized) {
        await registerAttempt(normalized, false, 'google-sub-ja-vinculado');
        return { ok: false, error: DENIED };
    }
    const user = await prisma.user.findUnique({
        where: { email: normalized },
        include: {
            regional: { select: { name: true } },
            role: { include: { permissions: { select: { permissionKey: true } } } },
        },
    });
    if (!user || user.status !== 'ATIVO' || (user.googleSub && user.googleSub !== profile.sub)) {
        await registerAttempt(normalized, false, 'google-conta-nao-autorizada');
        return { ok: false, error: DENIED };
    }
    // Conditional binding prevents concurrent identities from replacing an established sub.
    const linked = await prisma.user.updateMany({
        where: {
            id: user.id,
            email: normalized,
            status: 'ATIVO',
            OR: [{ googleSub: null }, { googleSub: profile.sub }],
        },
        data: {
            googleSub: profile.sub,
            passwordHash: null,
            mustChangePassword: false,
            failedLoginCount: 0,
            lockedUntil: null,
            inviteTokenHash: null,
            inviteExpiresAt: null,
            resetTokenHash: null,
            resetExpiresAt: null,
            lastAccessAt: new Date(),
        },
    });
    if (linked.count !== 1) return { ok: false, error: DENIED };
    await issueSession(user.id, {
        authMethod: 'GOOGLE_WORKSPACE',
        sub: profile.sub,
        domain: domain!,
    });
    await registerAttempt(normalized, true, 'google-workspace');
    await recordAudit({
        action: 'Login realizado com Google Workspace',
        target: 'Painel administrativo',
        userId: user.id,
        actorLabel: user.email,
    });
    return { ok: true, user: toSessionUser(user) };
}
