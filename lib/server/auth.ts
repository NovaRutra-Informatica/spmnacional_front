import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './db';
import { generateToken, hashToken, verifyPassword } from './crypto';
import { recordAudit, requestMeta } from './audit';

export const SESSION_COOKIE = 'spm_session';

/** Expiração absoluta da sessão. */
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Inatividade tolerada — coerente com a política exibida em Configurações. */
const SESSION_IDLE_MS = 30 * 60 * 1000;
/** Bloqueio após tentativas malsucedidas. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

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

// ---------------------------------------------------------
// Sessão
// ---------------------------------------------------------

export async function createSession(userId: string): Promise<void> {
    const token = generateToken(32);
    const meta = await requestMeta();

    await prisma.session.create({
        data: {
            tokenHash: hashToken(token),
            userId,
            ip: meta.ip,
            userAgent: meta.userAgent,
            expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
        },
    });

    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    });
}

export async function destroySession(): Promise<void> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;

    if (token) {
        await prisma.session
            .updateMany({
                where: { tokenHash: hashToken(token), revokedAt: null },
                data: { revokedAt: new Date() },
            })
            .catch(() => undefined);
    }

    store.delete(SESSION_COOKIE);
}

/** Encerra todas as sessões de um usuário — usado ao desativar a conta. */
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
    mustChangePassword: boolean;
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
        mustChangePassword: user.mustChangePassword,
    };
}

/**
 * Usuário da sessão atual, ou null.
 *
 * Além de validar o token, aplica a expiração por inatividade e renova o
 * `lastSeenAt`. Não lança nem redireciona.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

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

    if (!session || session.revokedAt) return null;

    const now = Date.now();
    if (session.expiresAt.getTime() < now) return null;
    if (now - session.lastSeenAt.getTime() > SESSION_IDLE_MS) {
        await prisma.session
            .update({ where: { id: session.id }, data: { revokedAt: new Date() } })
            .catch(() => undefined);
        return null;
    }

    if (session.user.status !== 'ATIVO') return null;

    // Renova a marca de atividade no máximo uma vez por minuto.
    if (now - session.lastSeenAt.getTime() > 60_000) {
        await prisma.session
            .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
            .catch(() => undefined);
        await prisma.user
            .update({ where: { id: session.userId }, data: { lastAccessAt: new Date() } })
            .catch(() => undefined);
    }

    return toSessionUser(session.user);
}

/** Exige sessão ativa; sem ela, manda para a tela de login. */
export async function requireUser(): Promise<SessionUser> {
    const user = await getCurrentUser();
    if (!user) redirect('/atendente');
    return user;
}

export function hasPermission(user: SessionUser | null, permission: string): boolean {
    return Boolean(user?.permissions.includes(permission));
}

/** Exige uma permissão; sem ela, volta para o painel com aviso. */
export async function requirePermission(permission: string): Promise<SessionUser> {
    const user = await requireUser();
    if (!hasPermission(user, permission)) {
        redirect(`/admin?erro=permissao&recurso=${encodeURIComponent(permission)}`);
    }
    return user;
}

// ---------------------------------------------------------
// Login
// ---------------------------------------------------------

export type LoginResult =
    { ok: true; user: SessionUser } | { ok: false; error: string; lockedUntil?: Date };

async function registerAttempt(email: string, success: boolean, reason?: string): Promise<void> {
    const meta = await requestMeta();
    await prisma.loginAttempt
        .create({ data: { email, ip: meta.ip, success, reason } })
        .catch(() => undefined);
}

const GENERIC_ERROR = 'Usuário ou senha incorretos. Verifique e tente novamente.';

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
        where: { email: normalized },
        include: {
            regional: { select: { name: true } },
            role: { include: { permissions: { select: { permissionKey: true } } } },
        },
    });

    if (!user) {
        await registerAttempt(normalized, false, 'usuario-inexistente');
        await recordAudit({
            action: 'Tentativa de login malsucedida',
            target: normalized,
            level: 'ALERTA',
            actorLabel: normalized,
        });
        return { ok: false, error: GENERIC_ERROR };
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        await registerAttempt(normalized, false, 'conta-bloqueada');
        return {
            ok: false,
            error: 'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.',
            lockedUntil: user.lockedUntil,
        };
    }

    if (user.status !== 'ATIVO') {
        await registerAttempt(normalized, false, `status-${user.status}`);
        return {
            ok: false,
            error:
                user.status === 'PENDENTE'
                    ? 'Este convite ainda não foi aceito. Verifique o e-mail que enviamos.'
                    : 'Esta conta está desativada. Fale com a coordenação.',
        };
    }

    const valid = await verifyPassword(password, user.passwordHash);

    if (!valid) {
        const failed = user.failedLoginCount + 1;
        const shouldLock = failed >= MAX_FAILED_ATTEMPTS;

        await prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginCount: shouldLock ? 0 : failed,
                lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MS) : null,
            },
        });

        await registerAttempt(normalized, false, 'senha-invalida');
        await recordAudit({
            action: shouldLock
                ? `Conta bloqueada após ${MAX_FAILED_ATTEMPTS} tentativas`
                : 'Tentativa de login malsucedida',
            target: normalized,
            level: shouldLock ? 'CRITICO' : 'ALERTA',
            userId: user.id,
            actorLabel: normalized,
        });

        return {
            ok: false,
            error: shouldLock
                ? 'Conta bloqueada por 15 minutos após tentativas malsucedidas.'
                : GENERIC_ERROR,
        };
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastAccessAt: new Date() },
    });

    await createSession(user.id);
    await registerAttempt(normalized, true);
    await recordAudit({
        action: 'Login realizado',
        target: 'Painel administrativo',
        userId: user.id,
        actorLabel: user.email,
    });

    return { ok: true, user: toSessionUser(user) };
}

/**
 * Login por Google Workspace. A conta precisa existir e estar ativa: o site
 * não cria usuário automaticamente, para que o acesso continue sendo concedido
 * pela coordenação.
 */
export async function loginWithGoogleProfile(profile: {
    sub: string;
    email: string;
    name?: string;
    hd?: string;
}): Promise<LoginResult> {
    const normalized = profile.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
        where: { email: normalized },
        include: {
            regional: { select: { name: true } },
            role: { include: { permissions: { select: { permissionKey: true } } } },
        },
    });

    if (!user) {
        await registerAttempt(normalized, false, 'google-sem-conta');
        await recordAudit({
            action: 'Login com Google recusado (conta não cadastrada)',
            target: normalized,
            level: 'ALERTA',
            actorLabel: normalized,
        });
        return {
            ok: false,
            error: 'Esta conta Google ainda não tem acesso ao painel. Peça à coordenação para cadastrá-la.',
        };
    }

    if (user.status !== 'ATIVO') {
        await registerAttempt(normalized, false, `google-status-${user.status}`);
        return {
            ok: false,
            error: 'Esta conta está desativada ou pendente. Fale com a coordenação.',
        };
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            googleSub: profile.sub,
            failedLoginCount: 0,
            lockedUntil: null,
            lastAccessAt: new Date(),
        },
    });

    await createSession(user.id);
    await registerAttempt(normalized, true, 'google');
    await recordAudit({
        action: 'Login realizado com Google Workspace',
        target: 'Painel administrativo',
        userId: user.id,
        actorLabel: user.email,
    });

    return { ok: true, user: toSessionUser(user) };
}
