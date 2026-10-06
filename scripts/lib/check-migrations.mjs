/** Read-only migration preflight inside the protected migrator image.
 * Never reads .env, executes migrations, changes traffic or prints SQL URLs.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertMigrationDeployment } from './migration-policy.mjs';

let client;
try {
    const args = process.argv.slice(2);
    if (args.length > 2 || args.some(arg => !/^--mode=(online|maintenance)$/.test(arg) && !/^--app-protocol=[a-z0-9-]{1,64}$/.test(arg))
        || args.filter(arg => arg.startsWith('--mode=')).length > 1 || args.filter(arg => arg.startsWith('--app-protocol=')).length > 1)
        throw new Error('Use only --mode=online|maintenance and --app-protocol=<verified-image-label>.');
    const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] ?? 'online';
    const appProtocol = args.find(arg => arg.startsWith('--app-protocol='))?.split('=')[1] ?? '';
    const directory = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url));
    const migrations = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
        const filename = `${directory}${entry.name}/deployment.json`;
        if (!existsSync(filename)) return { name: entry.name, strategy: 'unknown' };
        const manifest = JSON.parse(readFileSync(filename, 'utf8'));
        if (manifest.schemaVersion !== 1 || !['expand', 'contract'].includes(manifest.strategy)
            || (manifest.requiredAppProtocol !== undefined && !/^[a-z0-9-]{1,64}$/.test(manifest.requiredAppProtocol)))
            throw new Error('Invalid migration deployment manifest.');
        return { name: entry.name, strategy: manifest.strategy, requiredAppProtocol: manifest.requiredAppProtocol };
    });
    client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000,
        statement_timeout: 5000, application_name: 'spm-migration-preflight' });
    if (!process.env.DATABASE_URL) throw new Error('Missing migration database configuration.');
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const table = await client.query("SELECT to_regclass('public._prisma_migrations') AS name");
    const applied = table.rows[0].name ? await client.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL') : { rows: [] };
    const pending = assertMigrationDeployment({ migrations, applied: new Set(applied.rows.map(row => row.migration_name)), mode,
        appProtocol,
        maintenanceConfirmed: process.env.SPM_MAINTENANCE_CONFIRMED === 'true',
        backupVerified: process.env.SPM_DATABASE_BACKUP_VERIFIED === 'true' });
    await client.query('COMMIT');
    console.log(JSON.stringify({ mode, appProtocol, pending, safeToMigrate: true }));
} catch (error) {
    // Only policy errors authored above are printable; provider exceptions can
    // carry endpoints, SQL or credential material and are always suppressed.
    const message = error instanceof Error && /^(Online migration blocked:|Maintenance migration requires|Migration history incompatible:|Application database protocol incompatible:|Invalid migration deployment|Use only --mode=|Missing migration database)/.test(error.message)
        ? error.message : 'Migration preflight failed; no migration was executed.';
    console.error(message);
    process.exitCode = 1;
} finally {
    await client?.end().catch(() => {});
}
