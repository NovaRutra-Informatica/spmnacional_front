import 'server-only';

/** Impede uma integração externa de alocar memória sem limite no JSON.parse. */
export async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel();
        throw new Error('Upstream response exceeds byte limit');
    }
    if (!response.body) throw new Error('Upstream response body missing');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
                await reader.cancel();
                throw new Error('Upstream response exceeds byte limit');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}
