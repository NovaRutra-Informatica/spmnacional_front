/** Release compatibility policy; never treats an unknown migration as safe. */
import { readFileSync } from 'node:fs';
export const DATABASE_PROTOCOL = JSON.parse(readFileSync(new URL('../../lib/database-protocol.json', import.meta.url), 'utf8')).protocol;
export function assertMigrationDeployment({ migrations, applied, mode, maintenanceConfirmed, backupVerified, appProtocol }) {
    if (!['online', 'maintenance'].includes(mode)) throw new Error('Invalid migration deployment mode');
    const known = new Set(migrations.map(migration => migration.name));
    const absent = [...applied].filter(name => !known.has(name));
    if (absent.length) throw new Error(`Migration history incompatible: applied migrations are absent from this migrator: ${absent.join(', ')}.`);
    const pending = migrations.filter(migration => !applied.has(migration.name));
    const incompatible = pending.filter(migration => migration.strategy !== 'expand');
    if (mode === 'online' && incompatible.length)
        throw new Error(`Online migration blocked: ${incompatible.map(item => item.name).join(', ')}. Coordinate maintenance, verified backup and a compatible rollback release.`);
    if (mode === 'maintenance' && pending.length && (!maintenanceConfirmed || !backupVerified))
        throw new Error('Maintenance migration requires explicit maintenance and verified backup acknowledgements.');
    const protocols = new Set(migrations.filter(migration => migration.strategy === 'contract')
        .map(migration => migration.requiredAppProtocol ?? DATABASE_PROTOCOL));
    if (protocols.size && (protocols.size !== 1 || !protocols.has(appProtocol) || appProtocol !== DATABASE_PROTOCOL))
        throw new Error('Application database protocol incompatible: verify the immutable app and migrator image labels before deployment or rollback.');
    return pending.map(({ name, strategy }) => ({ name, strategy }));
}
