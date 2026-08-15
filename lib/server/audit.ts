import 'server-only';

import { headers } from 'next/headers';
import type { AuditLevel } from '@/lib/generated/prisma/enums';
import { prisma } from './db';

export interface AuditInput {
    action: string;
    target: string;
    level?: AuditLevel;
    userId?: string | null;
    actorLabel?: string;
    metadata?: Record<string, unknown>;
}

/** Lê IP e user-agent da requisição atual, quando houver uma. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
    try {
        const headerList = await headers();
        const forwarded = headerList.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0]!.trim() : headerList.get('x-real-ip');
        return { ip: ip || null, userAgent: headerList.get('user-agent') };
    } catch {
        return { ip: null, userAgent: null };
    }
}

/**
 * Registra uma ação no log de auditoria.
 *
 * Nunca lança: auditoria que falha não pode derrubar a operação que a gerou.
 * Falhas vão para o console para aparecerem no Cloud Logging.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
    try {
        const meta = await requestMeta();
        await prisma.auditLog.create({
            data: {
                userId: input.userId ?? null,
                actorLabel: input.actorLabel ?? 'sistema',
                action: input.action,
                target: input.target,
                level: input.level ?? 'INFO',
                ip: meta.ip,
                userAgent: meta.userAgent,
                metadata: input.metadata ? (input.metadata as object) : undefined,
            },
        });
    } catch (error) {
        console.error('[auditoria] falha ao registrar', input.action, error);
    }
}
