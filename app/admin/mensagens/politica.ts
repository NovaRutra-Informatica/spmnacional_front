import 'server-only';

import type { Prisma } from '@/lib/generated/prisma/client';
import type { SessionUser } from '@/lib/server/auth';
import { isAdminGeral } from '../usuarios/politica';

/**
 * Mensagens públicas contêm PII. O administrador nacional triageia e atribui;
 * as demais pessoas veem somente o que foi explicitamente atribuído a elas.
 */
export function escopoMensagens(user: SessionUser): Prisma.ContactMessageWhereInput {
    return isAdminGeral(user) ? {} : { assignedToId: user.id };
}

export function podeAtribuirMensagens(user: SessionUser): boolean {
    return isAdminGeral(user);
}
