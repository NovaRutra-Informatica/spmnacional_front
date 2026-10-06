import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { TABLES, validatePayload } from './lib/hml-data-transfer.mjs';
import { localDockerConnection } from './lib/docker-local.mjs';

const output = resolve(process.argv[2] ?? 'tmp/hml-data-transfer-20261003');
const expected = resolve('tmp');
if (!output.startsWith(expected + '\\') && !output.startsWith(expected + '/')) throw new Error('Output must be inside ignored tmp');
const pairs = TABLES.map(table => `'${table.name}', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public."${table.name}" t)`).join(',');
const sql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object('version',1,'application','spmnacional','tables',jsonb_build_object(${pairs}),
 'userReferences',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'email',email)),'[]'::jsonb) FROM public."User"),
 'unsupportedSensitiveRows',(SELECT count(*) FROM public."ContactMessage")+(SELECT count(*) FROM public."Atendimento")+(SELECT count(*) FROM public."NewsletterSubscriber"));
COMMIT;`;
let step = 'local-docker';
try {
    const docker = localDockerConnection();
    step = 'database-snapshot';
    const raw = execFileSync('docker', docker.args(['exec', '-i', 'spm-db', 'psql', '-U', 'spm', '-d', 'spmnacional', '-Atq', '-v', 'ON_ERROR_STOP=1']), { env: docker.env, input: sql, maxBuffer: 24 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    step = 'payload-validation';
    const payload = JSON.parse(raw.trim());
    if (payload.unsupportedSensitiveRows !== 0) throw new Error('Sensitive data requires a separate encrypted transfer');
    delete payload.unsupportedSensitiveRows;
    const records = validatePayload(payload);
    step = 'private-output';
    await mkdir(output, { recursive: true, mode: 0o700 });
    if ((await lstat(output)).isSymbolicLink()) throw new Error('Invalid output');
    if (process.platform === 'win32') {
        const identity = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const sid = identity.match(/S-1-5-21-[0-9]+-[0-9]+-[0-9]+-[0-9]+/)?.[0];
        if (!sid) throw new Error('Windows identity unavailable');
        execFileSync('icacls.exe', [output, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { stdio: 'pipe' });
    }
    const uploads = [];
    step = 'media-copy';
    for (const media of payload.tables.Media) {
        const destination = join(output, `media-${uploads.length}.bin`);
        // Storage keys are canonical paths validated before reaching Docker.
        execFileSync('docker', docker.args(['cp', `spm-web:/app/storage/uploads/${media.storageKey}`, destination]), { env: docker.env, stdio: 'pipe' });
        const data = await readFile(destination);
        if (data.length !== media.size) throw new Error('Media length mismatch');
        uploads.push({ storageKey: media.storageKey, filename: `media-${uploads.length}.bin`, size: data.length,
            mimeType: media.mimeType, md5: createHash('md5').update(data).digest('base64'), sha256: createHash('sha256').update(data).digest('hex') });
    }
    step = 'write-exclusive-export';
    await writeFile(join(output, 'payload.json'), JSON.stringify(payload), { flag: 'wx', mode: 0o600 });
    await writeFile(join(output, 'uploads.json'), JSON.stringify(uploads), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ exported: true, records, tables: Object.fromEntries(TABLES.map(t => [t.name, payload.tables[t.name].length])), mediaFiles: uploads.length, mediaBytes: uploads.reduce((n, file) => n + file.size, 0), authDataIncluded: false, sensitiveRows: 0 }));
} catch {
    console.error(`Falha ao exportar dados editoriais (${step}); nenhum segredo ou registro foi exibido.`);
    process.exitCode = 1;
}
