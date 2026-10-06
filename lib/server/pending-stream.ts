import 'server-only';

export interface PendingSnapshot { messages: number; cases: number }

/** Bounded, cancellable SSE transport. Only aggregate counts enter the stream. */
export function createPendingStream(input: {
    signal: AbortSignal;
    snapshot: () => Promise<PendingSnapshot | null>;
    release: () => void;
    pollMs?: number;
    heartbeatMs?: number;
    lifetimeMs?: number;
}): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let finished = false;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let lifetime: ReturnType<typeof setTimeout> | undefined;
    let last = '';
    let sequence = 0;
    function finish(close = true) {
        if (finished) return;
        finished = true;
        clearTimeout(poll);
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        input.signal.removeEventListener('abort', onAbort);
        input.release();
        if (close) controller.close();
    }
    const onAbort = () => finish();
    function emit(value: string) {
        if (finished) return;
        // A consumer which stops reading cannot grow an unbounded event queue.
        if ((controller.desiredSize ?? 0) < 0) { finish(); return; }
        controller.enqueue(encoder.encode(value));
    }
    async function tick() {
        try {
            const value = await input.snapshot();
            if (finished) return;
            if (!value) { emit('event: session-ended\ndata: {}\n\n'); finish(); return; }
            if (![value.messages, value.cases].every(number => Number.isSafeInteger(number) && number >= 0 && number <= 1_000_000_000))
                throw new Error('Invalid pending snapshot');
            const payload = JSON.stringify({ messages: value.messages, cases: value.cases });
            if (payload !== last) {
                sequence++;
                emit(`${sequence === 1 ? 'retry: 5000\n' : ''}id: ${sequence}\nevent: pending\ndata: ${payload}\n\n`);
                last = payload;
            }
            if (!finished) poll = setTimeout(() => void tick(), input.pollMs ?? 10_000);
        } catch {
            if (!finished) { emit('event: unavailable\ndata: {}\n\n'); finish(); }
        }
    }
    return new ReadableStream<Uint8Array>({
        start(value) {
            controller = value;
            input.signal.addEventListener('abort', onAbort, { once: true });
            if (input.signal.aborted) { finish(); return; }
            heartbeat = setInterval(() => emit(': heartbeat\n\n'), input.heartbeatMs ?? 15_000);
            lifetime = setTimeout(() => finish(), input.lifetimeMs ?? 55_000);
            void tick();
        },
        cancel() { finish(false); },
    });
}

const globalState = globalThis as unknown as { spmPendingStreams?: Map<string, number> };
const active = globalState.spmPendingStreams ??= new Map<string, number>();
/** Per-process resource guard; shared PostgreSQL rate limits additionally bound reconnects. */
export function claimPendingStream(actorId: string): (() => void) | null {
    if ((active.get(actorId) ?? 0) >= 2 || [...active.values()].reduce((a, b) => a + b, 0) >= 24) return null;
    active.set(actorId, (active.get(actorId) ?? 0) + 1);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const count = (active.get(actorId) ?? 1) - 1;
        if (count <= 0) active.delete(actorId); else active.set(actorId, count);
    };
}
