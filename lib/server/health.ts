import 'server-only';
import { prisma } from './db';
import { logError } from './logger';
import databaseProtocol from '@/lib/database-protocol.json';
import type { PrismaClient } from '@/lib/generated/prisma/client';

export const DATABASE_PROTOCOL = databaseProtocol.protocol;

export async function databaseReady(database: Pick<PrismaClient, '$queryRaw'> = prisma): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        const rows = await Promise.race([
            database.$queryRaw<Array<{ ready: boolean }>>`
                WITH required AS (SELECT jsonb_array_elements_text(${JSON.stringify(databaseProtocol.requiredRlsTables)}::jsonb) AS name)
                SELECT count(c.oid) = ${databaseProtocol.requiredRlsTables.length}
                    AND COALESCE(bool_and(c.relrowsecurity AND c.relforcerowsecurity
                        AND c.relowner <> r.oid AND NOT pg_has_role(current_user, c.relowner, 'MEMBER')), false)
                    AND NOT r.rolsuper AND NOT r.rolbypassrls AS ready
                FROM required q
                LEFT JOIN pg_namespace n ON n.nspname = 'public'
                LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = q.name AND c.relkind IN ('r', 'p')
                CROSS JOIN pg_roles r WHERE r.rolname = current_user
                GROUP BY r.oid, r.rolsuper, r.rolbypassrls
            `,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('timeout')), 3000);
            }),
        ]);
        return Array.isArray(rows) && rows.length === 1 && rows[0]?.ready === true;
    } catch (error) {
        logError('health.database_unavailable', error);
        return false;
    } finally {
        clearTimeout(timeout);
    }
}
