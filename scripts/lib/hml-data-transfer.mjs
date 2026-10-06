// Editorial-only transfer: credentials, sessions, PII and worker queues stay local.
/** @type {Array<[string, string, string, Record<string, string>]>} */
const DEFINITIONS = [
    ['Regional', 'slug', 'id slug uf name region description focus address city phone email active order createdAt updatedAt', {}],
    ['Category', 'slug', 'id slug name order', {}],
    ['Tag', 'slug', 'id slug name', {}],
    ['Media', 'storageKey', 'id filename originalName mimeType size kind url storageKey width height alt uploadedById createdAt', { uploadedById: 'User?' }],
    ['Post', 'slug', 'id slug title excerpt content categoryId coverUrl coverMediaId authorId authorName status publishedAt highlight views createdAt updatedAt', { categoryId: 'Category', coverMediaId: 'Media?', authorId: 'User?' }],
    ['PostTag', 'postId tagId', 'postId tagId', { postId: 'Post', tagId: 'Tag' }],
    ['Edital', 'slug', 'id code slug title description status deadlineText deadlineAt scope fileMediaId fileUrl published publishedAt order createdAt updatedAt', { fileMediaId: 'Media?' }],
    ['Testemunho', 'id', 'id text personName origin initials photoUrl consent consentNote anonymized featured published publishedAt order createdAt updatedAt', {}],
    ['Documento', 'id', 'id title category meta icon mediaId fileUrl published publishedAt order createdAt updatedAt', { mediaId: 'Media?' }],
    ['SemanaEdicao', 'ano', 'id ano slug edicao tema lema periodo startsOn endsOn coverUrl resumo objetivos citacao published createdAt updatedAt', {}],
    ['SemanaMaterial', 'id', 'id edicaoId icon title meta mediaId fileUrl order', { edicaoId: 'SemanaEdicao', mediaId: 'Media?' }],
    ['SemanaPrograma', 'id', 'id edicaoId dia title text order', { edicaoId: 'SemanaEdicao' }],
    ['AgendaEvent', 'title startsAt', 'id googleEventId calendarId title description location url startsAt endsAt allDay source published createdAt updatedAt', {}],
    ['SiteSetting', 'key', 'key value updatedAt', {}],
];
export const TABLES = DEFINITIONS.map(([name, keys, fields, refs]) => ({ name, keys: keys.split(' '), fields: fields.split(' '), refs }));

const quote = (value) => `"${value}"`;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function validStorageKey(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 512
        && value.split('/').every(part => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part)
            && !part.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

export function validatePayload(payload) {
    if (!payload || payload.version !== 1 || payload.application !== 'spmnacional'
        || !payload.tables || typeof payload.tables !== 'object'
        || Object.keys(payload.tables).length !== TABLES.length
        || !Array.isArray(payload.userReferences)) throw new Error('Invalid transfer payload');
    const names = new Set(TABLES.map(table => table.name));
    if (Object.keys(payload.tables).some(name => !names.has(name))) throw new Error('Forbidden transfer table');
    let total = 0;
    for (const table of TABLES) {
        const rows = payload.tables[table.name];
        if (!Array.isArray(rows) || rows.length > 20000) throw new Error('Invalid transfer rows');
        total += rows.length;
        const identities = new Set();
        for (const row of rows) {
            if (!row || Array.isArray(row) || typeof row !== 'object'
                || Object.keys(row).some(field => !table.fields.includes(field))
                || table.keys.some(key => !own(row, key) || row[key] == null)
                || (table.name !== 'PostTag' && table.name !== 'SiteSetting' && typeof row.id !== 'string'))
                throw new Error('Invalid transfer fields');
            const identity = JSON.stringify(table.keys.map(key => row[key]));
            if (identities.has(identity)) throw new Error('Duplicate source identity');
            identities.add(identity);
            if (table.name === 'Media' && (!validStorageKey(row.storageKey)
                || !Number.isInteger(row.size) || row.size < 1 || row.size > 10 * 1024 * 1024))
                throw new Error('Invalid transfer media');
            if (table.name === 'SiteSetting' && row.key !== 'site') throw new Error('Forbidden transfer setting');
        }
    }
    if (total > 50000 || Buffer.byteLength(JSON.stringify(payload)) > 20 * 1024 * 1024)
        throw new Error('Transfer exceeds size limit');
    const refs = new Set();
    for (const user of payload.userReferences) {
        if (!user || Object.keys(user).sort().join(',') !== 'email,id'
            || typeof user.id !== 'string' || typeof user.email !== 'string'
            || user.id.length > 256 || user.email.length > 320 || refs.has(user.id))
            throw new Error('Invalid user reference');
        refs.add(user.id);
    }
    return total;
}

export function remapRow(table, source, maps) {
    const row = { ...source };
    for (const [field, reference] of Object.entries(table.refs)) {
        if (row[field] == null) continue;
        const name = reference.replace('?', '');
        const mapped = maps.get(name)?.get(row[field]);
        if (!mapped && name !== 'User') throw new Error('Unresolved foreign key');
        row[field] = mapped ?? null;
    }
    if (table.name === 'Media') row.url = `/api/arquivos/${row.storageKey}`;
    if (table.name === 'Testemunho' && row.consent !== true) row.published = false;
    return row;
}

/** Existing rows are never updated. Every insert uses bound JSON, never SQL interpolation of data. */
export async function importEditorial(client, payload, { targetOrigin } = {}) {
    validatePayload(payload);
    if (targetOrigin !== 'https://spm-hml.35.215.232.88.sslip.io') throw new Error('Unexpected target origin');
    const maps = new Map(TABLES.map(table => [table.name, new Map()]));
    maps.set('User', new Map());
    const summary = { version: 1, tables: {}, totalInserted: 0, totalPreserved: 0, unapprovedTestimonialsHidden: 0 };
    await client.query('BEGIN');
    try {
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('spm-hml-editorial-import-v1'))");
        await client.query(`LOCK TABLE ${TABLES.map(t => `public.${quote(t.name)}`).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
        // User metadata is used only to reconnect optional author/upload references.
        for (const user of payload.userReferences) {
            const result = await client.query('SELECT id FROM public."User" WHERE email = $1', [user.email]);
            if (result.rows.length === 1) maps.get('User').set(user.id, result.rows[0].id);
        }
        for (const table of TABLES) {
            const counts = { source: payload.tables[table.name].length, inserted: 0, preserved: 0 };
            for (const source of payload.tables[table.name]) {
                const row = remapRow(table, source, maps);
                const identifier = table.name === 'SiteSetting' ? 'key' : 'id';
                const keyWhere = table.keys.map((key, i) => `${quote(key)} = $${i + 1}`).join(' AND ');
                const values = table.keys.map(key => row[key]);
                const hasId = own(row, 'id');
                const idWhere = hasId ? ` OR id = $${values.length + 1}` : '';
                if (hasId) values.push(row.id);
                // Compare business keys using their PostgreSQL column types.
                // Date parsing in JS depends on TZ for timestamp-without-zone
                // columns and can otherwise reject a valid repeated import.
                const existing = await client.query(`SELECT *, (${keyWhere}) AS "__transferKeyMatches" FROM public.${quote(table.name)} WHERE (${keyWhere})${idWhere}`, values);
                if (existing.rows.length > 1) throw new Error('Ambiguous target identity');
                if (existing.rows.length === 1) {
                    const saved = existing.rows[0];
                    // An equal id with a different business identity is a collision, not a match.
                    if (hasId && saved.id === row.id && saved.__transferKeyMatches !== true)
                        throw new Error('Conflicting target identity');
                    if (hasId) maps.get(table.name).set(source.id, saved.id);
                    counts.preserved++;
                    continue;
                }
                const fields = Object.keys(row);
                const selection = fields.map(quote).join(',');
                const returning = table.name === 'PostTag' ? '"postId", "tagId"' : quote(identifier);
                const inserted = await client.query(`INSERT INTO public.${quote(table.name)} (${selection})
                    SELECT ${selection} FROM jsonb_populate_record(NULL::public.${quote(table.name)}, $1::jsonb)
                    RETURNING ${returning}`, [JSON.stringify(row)]);
                if (inserted.rows.length !== 1) throw new Error('Insert not verified');
                if (hasId) maps.get(table.name).set(source.id, inserted.rows[0].id);
                counts.inserted++;
                if (table.name === 'Testemunho' && row.consent !== true) summary.unapprovedTestimonialsHidden++;
            }
            summary.tables[table.name] = counts;
            summary.totalInserted += counts.inserted;
            summary.totalPreserved += counts.preserved;
        }
        await client.query('COMMIT');
        return summary;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}
