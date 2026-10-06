import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { env } from './env';
import { createScopedDatabase } from './database-scope';
export { withActorDatabaseScope, withPublicContactDatabaseScope } from './database-scope';

/**
 * Cliente Prisma único por processo.
 *
 * Compartilhado inclusive em produção: SSR e Route Handlers podem carregar
 * cópias do módulo em bundles distintos dentro do mesmo processo. O pool
 * continua sendo por processo/instância, não global entre réplicas do serviço.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
    const adapter = new PrismaPg({
        connectionString: env.databaseUrl,
        max: env.database.poolMax,
        connectionTimeoutMillis: env.database.connectionTimeoutMs,
        idleTimeoutMillis: 30000,
        statement_timeout: env.database.queryTimeoutMs,
        query_timeout: env.database.queryTimeoutMs,
        application_name: 'spm-site',
    });
    return new PrismaClient({
        adapter,
        // Exceções Prisma podem carregar consulta e dados pessoais; o logger sanitiza no chamador.
        log: process.env.NODE_ENV === 'development' ? ['warn'] : [],
        transactionOptions: { maxWait: 5000, timeout: env.database.queryTimeoutMs },
    });
}

export const prisma: PrismaClient = createScopedDatabase(globalForPrisma.prisma ??= createClient());
