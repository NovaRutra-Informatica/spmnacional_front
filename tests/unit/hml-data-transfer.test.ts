import { describe, expect, it, vi } from 'vitest';
import { TABLES, importEditorial, remapRow, validatePayload, validStorageKey } from '../../scripts/lib/hml-data-transfer.mjs';

type Payload = { version: number; application: string; tables: Record<string, Record<string, unknown>[]>; userReferences: Record<string, unknown>[] };
const empty = (): Payload => ({ version: 1, application: 'spmnacional', tables: Object.fromEntries(TABLES.map((t: { name: string }) => [t.name, []])), userReferences: [] });
const table = (name: string) => TABLES.find((t: { name: string }) => t.name === name)!;

describe('HML editorial data transfer', () => {
    it('limits the payload to editorial tables and strips auth fields by rejection', () => {
        expect(validatePayload(empty())).toBe(0);
        const payload = empty();
        payload.tables.User = [{ id: 'local', passwordHash: 'secret' }];
        expect(() => validatePayload(payload)).toThrow();
        const malicious = empty();
        malicious.userReferences = [{ id: 'local', email: 'test@example.org', passwordHash: 'secret' }];
        expect(() => validatePayload(malicious)).toThrow();
    });
    it('rejects unknown columns, duplicate identities and settings outside site', () => {
        const payload = empty();
        payload.tables.Category = [{ id: 'a', slug: 'a', name: 'A', password: 'secret' }];
        expect(() => validatePayload(payload)).toThrow();
        payload.tables.Category = [{ id: 'a', slug: 'a' }, { id: 'b', slug: 'a' }];
        expect(() => validatePayload(payload)).toThrow();
        payload.tables.Category = [];
        payload.tables.SiteSetting = [{ key: 'AUTH_SECRET', value: 'secret' }];
        expect(() => validatePayload(payload)).toThrow();
    });
    it('validates media paths on Windows and Linux', () => {
        expect(validStorageKey('uploads/2026/10/image.png')).toBe(true);
        for (const key of ['../secret', 'uploads//x', 'C:/test.png', 'uploads/con.png', 'uploads/a.']) expect(validStorageKey(key)).toBe(false);
    });
    it('rebases media, reconnects FKs and avoids new login accounts', () => {
        const maps = new Map([['Category', new Map([['local', 'hml']])], ['User', new Map()]]);
        expect(remapRow(table('Post'), { categoryId: 'local', authorId: 'absent', title: 'Test' }, maps)).toEqual({ categoryId: 'hml', authorId: null, title: 'Test' });
        expect(() => remapRow(table('Post'), { categoryId: 'missing' }, maps)).toThrow();
        expect(remapRow(table('Media'), { storageKey: 'uploads/a.png', url: 'http://localhost/a.png' }, maps).url).toBe('/api/arquivos/uploads/a.png');
    });
    it('keeps testimonials without consent unpublished', () => {
        expect(remapRow(table('Testemunho'), { consent: false, published: true }, new Map()).published).toBe(false);
        expect(remapRow(table('Testemunho'), { consent: true, published: true }, new Map()).published).toBe(true);
    });
    it('rolls back a failed insert and binds content rather than interpolating SQL', async () => {
        const payload = empty();
        payload.tables.Category = [{ id: 'a', slug: 'test', name: "O'Reilly; DROP TABLE" }];
        const query = vi.fn(async (sql: string) => {
            if (sql.startsWith('INSERT')) throw new Error('rejected');
            return { rows: [] };
        });
        await expect(importEditorial({ query }, payload, { targetOrigin: 'https://spm-hml.35.215.232.88.sslip.io' })).rejects.toThrow();
        expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
        const insert = query.mock.calls.find(call => call[0].startsWith('INSERT'))!;
        expect(insert[0]).toContain('$1::jsonb');
        expect(insert[0]).not.toContain('DROP TABLE');
    });
    it('preserves existing content and remaps source ids by business key', async () => {
        const payload = empty();
        payload.tables.Category = [{ id: 'local', slug: 'news', name: 'Local' }];
        payload.tables.Post = [{ id: 'post', slug: 'post', categoryId: 'local', title: 'Test' }];
        const query = vi.fn(async (sql: string, values?: unknown[]) => {
            if (sql.startsWith('SELECT *,') && sql.includes('FROM public."Category"')) return { rows: [{ id: 'hml', slug: 'news', name: 'Existing', __transferKeyMatches: true }] };
            if (sql.startsWith('INSERT INTO public."Post"')) { expect(JSON.parse(values![0] as string).categoryId).toBe('hml'); return { rows: [{ id: 'post' }] }; }
            return { rows: [] };
        });
        const report = await importEditorial({ query }, payload, { targetOrigin: 'https://spm-hml.35.215.232.88.sslip.io' });
        expect(report.totalInserted).toBe(1);
        expect(report.totalPreserved).toBe(1);
        expect(query.mock.calls.some(call => call[0].startsWith('UPDATE'))).toBe(false);
        expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    });
    it('rejects a different target origin before opening a transaction', async () => {
        const query = vi.fn();
        await expect(importEditorial({ query }, empty(), { targetOrigin: 'https://production.example' })).rejects.toThrow();
        expect(query).not.toHaveBeenCalled();
    });
    it('uses PostgreSQL identity comparison for repeat timestamps independent of Node TZ', async () => {
        const payload = empty();
        payload.tables.AgendaEvent = [{ id: 'event', title: 'Synthetic', startsAt: '2026-10-03T00:00:00.000Z' }];
        const query = vi.fn(async (sql: string) => {
            if (sql.startsWith('SELECT *,')) {
                expect(sql).toContain('("title" = $1 AND "startsAt" = $2) AS "__transferKeyMatches"');
                return { rows: [{ id: 'event', title: 'Synthetic', startsAt: new Date('2026-10-03T03:00:00.000Z'), __transferKeyMatches: true }] };
            }
            return { rows: [] };
        });
        const report = await importEditorial({ query }, payload, { targetOrigin: 'https://spm-hml.35.215.232.88.sslip.io' });
        expect(report.totalPreserved).toBe(1);
        expect(report.totalInserted).toBe(0);
    });
    it('rejects an equal id whose business key differs according to PostgreSQL', async () => {
        const payload = empty();
        payload.tables.Category = [{ id: 'existing', slug: 'different', name: 'Synthetic' }];
        const query = vi.fn(async (sql: string) => sql.startsWith('SELECT *,')
            ? { rows: [{ id: 'existing', slug: 'old', __transferKeyMatches: false }] }
            : { rows: [] });
        await expect(importEditorial({ query }, payload, { targetOrigin: 'https://spm-hml.35.215.232.88.sslip.io' })).rejects.toThrow('Conflicting target identity');
        expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    });
});
