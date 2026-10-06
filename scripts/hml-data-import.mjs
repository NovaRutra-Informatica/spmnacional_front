import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { importEditorial } from './lib/hml-data-transfer.mjs';

const root = '/app/hml-data-transfer';
let client;
try {
    const connection = new URL(process.env.DATABASE_URL ?? '');
    if (connection.hostname !== 'localhost' || connection.pathname !== '/spmnacional'
        || connection.searchParams.get('host') !== '/var/run/postgresql'
        || decodeURIComponent(connection.username) !== 'spm') throw new Error('Unexpected HML database');
    const raw = await readFile(`${root}/payload.json`, 'utf8');
    if (Buffer.byteLength(raw) > 20 * 1024 * 1024) throw new Error('Oversize payload');
    client = new pg.Client({ connectionString: connection.href });
    await client.connect();
    const report = await importEditorial(client, JSON.parse(raw), {
        targetOrigin: 'https://spm-hml.35.215.232.88.sslip.io',
    });
    // Only aggregate counts are returned; no source records, user metadata or credentials.
    console.log(JSON.stringify({ imported: true, ...report }));
} catch {
    console.error('Falha na transferência editorial; transação revertida, sem detalhes de dados.');
    process.exitCode = 1;
} finally {
    await client?.end().catch(() => {});
}
