// Runs only in the protected migrator container. Never log connection strings/errors.
import pg from 'pg';

const OWNER = 'spm';
const RUNTIME = 'spm_app';
let owner;
let runtime;
try {
    owner = new URL(process.env.DATABASE_URL ?? '');
    runtime = new URL(process.env.RUNTIME_DATABASE_URL ?? '');
} catch {
    console.error('URLs SQL HML inválidas.');
    process.exit(1);
}
const valid = (url, username) =>
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
    url.hostname === 'localhost' &&
    url.port === '' &&
    decodeURIComponent(url.username) === username &&
    url.password !== '' &&
    url.pathname === '/spmnacional' &&
    url.searchParams.get('host') === '/var/run/postgresql';
if (!valid(owner, OWNER) || !valid(runtime, RUNTIME)) {
    console.error('URLs SQL HML inválidas.');
    process.exit(1);
}

const ownerClient = new pg.Client({ connectionString: owner.href });
let runtimeClient;
try {
    await ownerClient.connect();
    if (process.argv[2] === 'count-users') {
        const result = await ownerClient.query('SELECT count(*)::int AS count FROM public."User"');
        process.stdout.write(String(result.rows[0].count));
    } else {
        await ownerClient.query('BEGIN');
        const existing = await ownerClient.query(
            'SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1',
            [RUNTIME],
        );
        if (!existing.rowCount) {
            const literal = await ownerClient.query('SELECT quote_literal($1) AS password', [
                decodeURIComponent(runtime.password),
            ]);
            // DDL has no bind parameters; quote_literal is computed by PostgreSQL.
            await ownerClient.query(
                `CREATE ROLE spm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal.rows[0].password}`,
            );
            await ownerClient.query('GRANT CONNECT ON DATABASE spmnacional TO spm_app');
            await ownerClient.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
            await ownerClient.query('GRANT USAGE ON SCHEMA public TO spm_app');
            await ownerClient.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO spm_app');
            await ownerClient.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spm_app');
            await ownerClient.query('ALTER DEFAULT PRIVILEGES FOR ROLE spm IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO spm_app');
            await ownerClient.query('ALTER DEFAULT PRIVILEGES FOR ROLE spm IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO spm_app');
        } else if (Object.entries(existing.rows[0]).some(([key, value]) => key !== 'rolname' && value)) {
            throw new Error('Unsafe existing role');
        }
        // Default privileges may grant this table during a future migration.
        await ownerClient.query('REVOKE ALL ON TABLE public._prisma_migrations FROM spm_app');
        await ownerClient.query('COMMIT');
        runtimeClient = new pg.Client({ connectionString: runtime.href });
        await runtimeClient.connect();
        const check = await runtimeClient.query(`
            SELECT current_user = 'spm_app' AS identity_ok,
              NOT has_schema_privilege(current_user, 'public', 'CREATE') AS no_ddl,
              NOT has_table_privilege(current_user, 'public._prisma_migrations', 'SELECT') AS no_migrations,
              NOT pg_has_role(current_user, 'spm', 'MEMBER') AS no_owner_membership,
              (has_table_privilege(current_user, 'public."User"', 'SELECT')
                AND has_table_privilege(current_user, 'public."User"', 'INSERT')
                AND has_table_privilege(current_user, 'public."User"', 'UPDATE')
                AND has_table_privilege(current_user, 'public."User"', 'DELETE')) AS users_crud
        `);
        if (!Object.values(check.rows[0]).every(Boolean)) throw new Error('Unsafe SQL privileges');
        console.log('Papel SQL runtime criado/verificado, separado do migrador.');
    }
} catch {
    try { await ownerClient.query('ROLLBACK'); } catch { /* connection may be unavailable */ }
    console.error('Falha ao provisionar/verificar SQL HML; gateway permanece fechado.');
    process.exitCode = 1;
} finally {
    await runtimeClient?.end().catch(() => {});
    await ownerClient.end().catch(() => {});
}
