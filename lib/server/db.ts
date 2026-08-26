import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { env } from './env';

/**
 * Cliente Prisma único por processo.
 *
 * Em desenvolvimento o Next recarrega os módulos a cada alteração; guardar a
 * instância no globalThis evita abrir um pool novo a cada recarga.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
    const adapter = new PrismaPg({ connectionString: env.databaseUrl });
    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
