/** Explicit operator command. Configuration is provided by the protected runtime
 * environment; no .env loading, provider request or automatic secret output.
 */
import { prisma } from '../lib/server/db';
import { retryDeadLetterMediaDeletion } from '../lib/server/media-deletion-retry';

async function main() {
    const args = process.argv.slice(2);
    const selected = args.filter(arg => arg.startsWith('--job='));
    if (selected.length !== 1 || args.some(arg => arg !== '--apply' && !arg.startsWith('--job=')) || args.filter(arg => arg === '--apply').length > 1)
        throw new Error('Use --job=<id> and optionally --apply.');
    const id = selected[0].slice(6);
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(id)) throw new Error('Invalid job identifier.');
    const row = await prisma.mediaDeletion.findUnique({ where: { id }, select: { id: true, attempts: true, deadLetterAt: true, failureCode: true, leaseToken: true } });
    if (!row?.deadLetterAt || row.leaseToken) throw new Error('Job is not a parked dead letter without an active lease.');
    const apply = args.includes('--apply');
    const retried = apply ? await retryDeadLetterMediaDeletion(id) : false;
    console.log(JSON.stringify({ id: row.id, attempts: row.attempts, failureCode: row.failureCode, preview: !apply, retried }));
    if (apply && !retried) throw new Error('Job changed concurrently; reload before retrying.');
}
main().catch(() => { console.error('Storage DLQ operation failed; no provider request was made.'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
