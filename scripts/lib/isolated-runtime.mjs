/** Provision only the disposable local E2E runtime; never reads .env. */
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export function assertIsolatedOwner(databaseUrl, runId) {
    const url = new URL(databaseUrl);
    if (!/^spm-test-[a-f0-9]{16}$/.test(runId ?? '') || !['postgres:', 'postgresql:'].includes(url.protocol)
        || url.search !== '' || url.hostname !== '127.0.0.1'
        || !url.port || url.pathname !== '/spm_test' || url.username !== 'spm_test')
        throw new Error('Runtime provisioning requires the disposable loopback test owner.');
    return url;
}

export async function provisionIsolatedRuntime(databaseUrl, runId) {
    const url = assertIsolatedOwner(databaseUrl, runId);
    const password = randomBytes(32).toString('base64url');
    const owner = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
    let runtime;
    try {
        await owner.connect();
        // The role and SQL identifiers are fixed. The generated base64url value
        // contains no SQL metacharacters and never enters argv or console output.
        await owner.query(`CREATE ROLE spm_e2e_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10;
            GRANT USAGE ON SCHEMA public TO spm_e2e_app;
            REVOKE CREATE ON SCHEMA public FROM spm_e2e_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO spm_e2e_app;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spm_e2e_app;
            REVOKE ALL ON TABLE _prisma_migrations FROM spm_e2e_app;`);
        url.username = 'spm_e2e_app';
        url.password = password;
        runtime = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
        await runtime.connect();
        const { rows: [identity] } = await runtime.query(`SELECT current_user AS name, r.rolsuper AS superuser,
            r.rolbypassrls AS "bypassRls", r.rolcreatedb AS "createDatabase", r.rolcreaterole AS "createRole",
            EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relowner = r.oid) AS owner,
            has_schema_privilege(current_user, 'public', 'CREATE') AS "createSchemaObjects"
            FROM pg_roles r WHERE r.rolname = current_user`);
        if (identity.name !== 'spm_e2e_app' || Object.entries(identity).some(([key, value]) => key !== 'name' && value !== false))
            throw new Error('Unsafe disposable runtime privileges.');
        const { rows: [sensitive] } = await runtime.query('SELECT (SELECT count(*) FROM "Atendimento")::int AS cases, (SELECT count(*) FROM "ContactMessage")::int AS messages');
        if (sensitive.cases !== 0 || sensitive.messages !== 0)
            throw new Error('Unscoped disposable runtime can read sensitive rows.');
        try {
            await runtime.query('SELECT migration_name FROM _prisma_migrations LIMIT 1');
            throw new Error('Disposable runtime can read migration metadata.');
        } catch (error) {
            if (error.code !== '42501') throw error;
        }
        return { databaseUrl: url.href, role: identity };
    } catch {
        throw new Error('Disposable E2E runtime provisioning failed; application was not started.');
    } finally {
        await runtime?.end().catch(() => {});
        await owner.end().catch(() => {});
    }
}
