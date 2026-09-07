import 'server-only';

import { isIP } from 'node:net';
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

/**
 * Extrai o cliente somente quando a quantidade de proxies confiáveis foi
 * configurada explicitamente. Cabeçalhos encaminhados vêm do próprio cliente
 * quando a aplicação é acessada diretamente; confiar neles por padrão permite
 * falsificar IPs e contornar limites.
 *
 * `TRUSTED_PROXY_HOPS=0` usa o endereço mais à direita do X-Forwarded-For;
 * valores maiores pulam essa quantidade de endereços de proxies à direita.
 */
function trustedClientIp(forwarded: string | null): string | null {
    const configured = process.env.TRUSTED_PROXY_HOPS?.trim();
    if (configured === undefined || !/^\d+$/.test(configured) || !forwarded) return null;

    const trustedHops = Number.parseInt(configured, 10);
    const chain = forwarded
        .split(',')
        .map((part) => part.trim())
        .filter((part) => isIP(part) !== 0);
    const candidate = chain[chain.length - trustedHops - 1];
    return candidate && isIP(candidate) !== 0 ? candidate : null;
}

/** Lê metadados sanitizados da requisição atual, quando houver uma. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
    try {
        const headerList = await headers();
        const ip = trustedClientIp(headerList.get('x-forwarded-for'));
        const rawUserAgent = headerList.get('user-agent')?.trim() || null;
        const userAgent = rawUserAgent ? rawUserAgent.slice(0, 512) : null;
        return { ip, userAgent };
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
