import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPendingStream, claimPendingStream } from '../../lib/server/pending-stream';
const text = (value: Uint8Array | undefined) => new TextDecoder().decode(value);
afterEach(() => vi.useRealTimers());

describe('SSE de pendências limitado, sem PII e com cancelamento', () => {
    it('envia counts, heartbeat e alterações sem emitir snapshots repetidos', async () => {
        vi.useFakeTimers();
        const snapshot = vi.fn().mockResolvedValue({ messages: 2, cases: 3 });
        const release = vi.fn();
        const reader = createPendingStream({ signal: new AbortController().signal, snapshot, release }).getReader();
        expect(text((await reader.read()).value)).toContain('data: {"messages":2,"cases":3}');
        await vi.advanceTimersByTimeAsync(15_000);
        expect(text((await reader.read()).value)).toBe(': heartbeat\n\n');
        snapshot.mockResolvedValue({ messages: 4, cases: 3 });
        await vi.advanceTimersByTimeAsync(5000);
        expect(text((await reader.read()).value)).toContain('id: 2\nevent: pending');
        await reader.cancel();
        expect(release).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('fecha ao expirar/revogar a sessão e nunca expõe erro de banco', async () => {
        const snapshot = vi.fn().mockResolvedValue(null);
        const release = vi.fn();
        const reader = createPendingStream({ signal: new AbortController().signal, snapshot, release }).getReader();
        expect(text((await reader.read()).value)).toContain('session-ended');
        expect((await reader.read()).done).toBe(true);
        expect(release).toHaveBeenCalledOnce();
        snapshot.mockRejectedValue(new Error('private-secret-url'));
        const failed = createPendingStream({ signal: new AbortController().signal, snapshot, release }).getReader();
        expect(text((await failed.read()).value)).toBe('event: unavailable\ndata: {}\n\n');
        expect((await failed.read()).done).toBe(true);
    });
    it('abort encerra timers e uma resposta tardia não escreve após cancelamento', async () => {
        vi.useFakeTimers();
        const abort = new AbortController();
        let resolve!: (value: { messages: number; cases: number }) => void;
        const release = vi.fn();
        const reader = createPendingStream({ signal: abort.signal, release, snapshot: () => new Promise(done => { resolve = done; }) }).getReader();
        abort.abort();
        resolve({ messages: 1, cases: 1 });
        expect((await reader.read()).done).toBe(true);
        expect(release).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('limita duração e libera vagas uma única vez', async () => {
        vi.useFakeTimers();
        const release = vi.fn();
        const reader = createPendingStream({ signal: new AbortController().signal, release, snapshot: async () => ({ messages: 0, cases: 0 }), lifetimeMs: 100 }).getReader();
        await reader.read();
        await vi.advanceTimersByTimeAsync(100);
        expect((await reader.read()).done).toBe(true);
        expect(release).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
        const one = claimPendingStream('isolated-stream-test');
        const two = claimPendingStream('isolated-stream-test');
        expect(one).toBeTypeOf('function');
        expect(two).toBeTypeOf('function');
        expect(claimPendingStream('isolated-stream-test')).toBeNull();
        one!(); one!(); two!();
        const next = claimPendingStream('isolated-stream-test');
        expect(next).toBeTypeOf('function');
        next!();
    });
});
