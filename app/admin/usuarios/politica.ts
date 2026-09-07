import 'server-only';

import type { Prisma } from '@/lib/generated/prisma/client';
import type { SessionUser } from '@/lib/server/auth';

/** O único perfil que pode operar acessos e perfis em âmbito nacional. */
export const ADMIN_ROLE_KEY = 'admin';

export function isAdminGeral(user: SessionUser): boolean {
    return user.role.key === ADMIN_ROLE_KEY;
}

/**
 * Limite aplicado tanto às páginas quanto às Server Actions de usuários.
 * Uma coordenação local nunca recebe do banco contas de outra regional nem
 * contas administrativas, mesmo que tente trocar o id enviado pelo formulário.
 */
export function escopoUsuarios(user: SessionUser): Prisma.UserWhereInput {
    if (isAdminGeral(user)) return {};
    if (!user.regionalId) return { id: { in: [] } };

    return {
        regionalId: user.regionalId,
        role: { key: { not: ADMIN_ROLE_KEY } },
    };
}

/** Coordenações podem delegar somente perfis não administrativos. */
export function perfilPermitido(user: SessionUser, roleKey: string): boolean {
    return isAdminGeral(user) || roleKey !== ADMIN_ROLE_KEY;
}

/** Coordenações não podem criar, remover ou transferir contas entre regionais. */
export function regionalPermitida(user: SessionUser, regionalId: string): boolean {
    return isAdminGeral(user) || Boolean(user.regionalId && regionalId === user.regionalId);
}
