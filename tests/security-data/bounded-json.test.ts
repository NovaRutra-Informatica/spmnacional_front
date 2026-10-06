import { describe, expect, it } from 'vitest';
import { readBoundedJson } from '@/lib/server/bounded-json';

describe('external JSON byte budget', () => {
    it('accepts a valid small response', async () => {
        await expect(readBoundedJson(Response.json({ ok: true }), 100)).resolves.toEqual({
            ok: true,
        });
    });
    it('rejects oversized declared response before allocation', async () => {
        await expect(
            readBoundedJson(new Response('{}', { headers: { 'content-length': '1000' } }), 10),
        ).rejects.toThrow();
    });
    it('enforces the real byte budget even without Content-Length', async () => {
        await expect(readBoundedJson(new Response('x'.repeat(100)), 10)).rejects.toThrow();
    });
    it('rejects absent or malformed JSON bodies', async () => {
        await expect(readBoundedJson(new Response(null), 10)).rejects.toThrow();
        await expect(readBoundedJson(new Response('<html>'), 10)).rejects.toThrow();
    });
});
