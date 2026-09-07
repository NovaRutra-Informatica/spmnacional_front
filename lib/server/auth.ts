import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './db';
import { generateToken, hashToken, verifyPassword } from './crypto';
import { recordAudit, requestMeta } from './audit';
import { consumeRateLimit } from './rate-limit';

export const SESSION_COOKIE =
    process.env.NODE_ENV === 'production' ? '__Host-spm_session' : 'spm_session';

/** Expiração absoluta da sessão. */
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Inatividade tolerada — coerente com a política exibida em Configurações. */
const SESSION_IDLE_MS = 30 * 60 * 1000;

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
        priority: 'high',
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

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; error: string };

async function registerAttempt(
    email: string,
    success: boolean,
    reason?: string,
    ip?: string | null,
): Promise<void> {
    const meta = ip === undefined ? await requestMeta() : { ip };
    await prisma.loginAttempt
        .create({ data: { email, ip: meta.ip, success, reason } })
        .catch(() => undefined);
}

const GENERIC_ERROR = 'Usuário ou senha incorretos. Verifique e tente novamente.';
const RATE_LIMIT_ERROR =
    'Muitas tentativas foram feitas. Aguarde alguns minutos e tente novamente.';
// Executar o mesmo scrypt para e-mails inexistentes reduz enumeração por tempo de resposta.
const DUMMY_PASSWORD_HASH =
    'scrypt$a/r7cJy1FyEAjfhtqKXtdw==$5GSI/QkZ6oncIIcHDPCsQqfLCjAhJIP9r9LRlhIgd3zAYPhChh1pwVJ54h0MbpSb/D62N9eNd9xxceu2WR/fdw==';

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();
    const meta = await requestMeta();
    const limits = [
        // Tetos globais e por conta não dependem de cabeçalhos de IP e não
        // podem ser contornados trocando X-Forwarded-For ou user-agent.
        consumeRateLimit({
            scope: 'login-global',
            identifier: 'all',
            limit: 300,
            windowMs: 15 * 60 * 1000,
        }),
        consumeRateLimit({
            scope: 'login-account',
            identifier: normalized,
            limit: 8,
            windowMs: 15 * 60 * 1000,
        }),
    ];

    // O limite por origem é uma camada adicional, habilitada apenas quando o
    // proxy confiável foi configurado. Nunca substitui o teto por conta.
    if (meta.ip) {
        limits.push(
            consumeRateLimit({
                scope: 'login-source',
                identifier: meta.ip,
                limit: 30,
                windowMs: 15 * 60 * 1000,
            }),
        );
    }

    const limitResults = await Promise.all(limits);

    if (limitResults.some((result) => !result.allowed)) {
        await recordAudit({
            action: 'Login limitado por excesso de tentativas',
            target: 'Painel administrativo',
            level: 'ALERTA',
            actorLabel: 'origem não autenticada',
        });
        return { ok: false, error: RATE_LIMIT_ERROR };
    }

    const user = await prisma.user.findUnique({
        where: { email: normalized },
        include: {
            regional: { select: { name: true } },
            role: { include: { permissions: { select: { permissionKey: true } } } },
        },
    });

    const now = new Date();
    if (user?.lockedUntil && user.lockedUntil > now) {
        // Mantém custo semelhante ao caminho comum e não revela se a conta
        // existe ou está temporariamente bloqueada.
        await verifyPassword(password, DUMMY_PASSWORD_HASH);
        await registerAttempt(normalized, false, 'bloqueio-temporario', meta.ip);
        return { ok: false, error: GENERIC_ERROR };
    }

    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid || user.status !== 'ATIVO') {
        if (user) {
            const previousFailures =
                user.lockedUntil && user.lockedUntil <= now ? 0 : user.failedLoginCount;
            const nextFailures = previousFailures + 1;
            const shouldLock = nextFailures >= 5;
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    failedLoginCount: shouldLock ? 0 : nextFailures,
                    lockedUntil: shouldLock ? new Date(now.getTime() + 15 * 60 * 1000) : null,
                },
            });
        }

        const reason = !user
            ? 'usuario-inexistente'
            : !valid
              ? 'senha-invalida'
              : `status-${user.status.toLowerCase()}`;
        await registerAttempt(normalized, false, reason, meta.ip);
        await recordAudit({
            action: 'Tentativa de login malsucedida',
            target: normalized,
            level: 'ALERTA',
            userId: user?.id,
            actorLabel: normalized,
            metadata: { reason },
        });
        return { ok: false, error: GENERIC_ERROR };
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastAccessAt: new Date() },
    });

    await createSession(user.id);
    await registerAttempt(normalized, true, undefined, meta.ip);
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

    const linkedAccount = await prisma.user.findUnique({
        where: { googleSub: profile.sub },
        select: { id: true, email: true },
    });

    if (linkedAccount && linkedAccount.email.toLowerCase() !== normalized) {
        await registerAttempt(normalized, false, 'google-sub-ja-vinculado');
        await recordAudit({
            action: 'Login com Google recusado (identidade já vinculada)',
            target: 'Painel administrativo',
            level: 'CRITICO',
            actorLabel: normalized,
        });
        return { ok: false, error: 'Esta conta Google não está autorizada para este acesso.' };
    }

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
        return { ok: false, error: 'Esta conta Google não está autorizada para este acesso.' };
    }

    if (user.status !== 'ATIVO' || (user.googleSub && user.googleSub !== profile.sub)) {
        await registerAttempt(normalized, false, `google-status-${user.status}`);
        return { ok: false, error: 'Esta conta Google não está autorizada para este acesso.' };
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
