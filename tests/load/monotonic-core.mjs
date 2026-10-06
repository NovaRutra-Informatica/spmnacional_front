import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { gunzipSync } from 'node:zlib';

export const MAX_IN_FLIGHT = 200;
export const REQUEST_TIMEOUT_MS = 8000;
export const MAX_BODY_BYTES = 1024 * 1024;
export const PUBLIC_MIX = Object.freeze([0, 0, 1, 2, 5, 3, 1, 2, 0, 4]);
export const PUBLIC_ENDPOINTS = Object.freeze(
    [
        {
            key: 'home',
            path: '/',
            sentinel: /class="home-page"/,
            additional: 'Destaques do Serviço Pastoral dos Migrantes',
        },
        {
            key: 'blog',
            path: '/publicacoes/blog',
            sentinel: /<h1[^>]*>O que estamos pensando e fazendo<\/h1>/,
            additional: 'noticia-carga-0001',
        },
        {
            key: 'article',
            path: '/publicacoes/blog/noticia-carga-0001',
            sentinel: /class="law-meta"/,
            additional: 'Tempo de leitura',
        },
        {
            key: 'agenda',
            path: '/agenda',
            sentinel: /<h1[^>]*>Agenda<\/h1>/,
            additional: 'O que vem pela frente',
        },
        {
            key: 'about',
            path: '/quem-somos',
            sentinel: /<h1[^>]*>Quem somos<\/h1>/,
            additional: 'Um serviço da Igreja no Brasil junto a quem migra',
        },
        { key: 'public_media', path: '/api/arquivos/biblioteca/carga-0001.png', binary: true },
    ].map(Object.freeze),
);

export function validateMonotonicConfig(env) {
    if (
        env.BASE_URL !== 'http://spm-load-app:3000' ||
        env.LOAD_PROFILE !== 'capacity' ||
        !/^spm-load-[a-f0-9]{16}$/.test(env.SPM_LOAD_RUN || '') ||
        !['gzip', 'identity'].includes(env.LOAD_ENCODING)
    ) {
        throw new Error(
            'Monotonic capacity requires the fixed isolated origin, run, profile and encoding.',
        );
    }
    if (env.AUTH_COOKIE || env.AUTH_COOKIES || env.K6_HTTP_DEBUG)
        throw new Error('Public capacity forbids cookies and HTTP debug.');
    return { run: env.SPM_LOAD_RUN, encoding: env.LOAD_ENCODING };
}

export function temporalSampleValid(value) {
    return Number.isFinite(value) && value >= 0;
}

export function percentile(sorted, fraction) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * fraction;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

export function trend(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
        avg: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
        min: sorted[0] ?? null,
        med: percentile(sorted, 0.5),
        max: sorted.at(-1) ?? null,
        'p(90)': percentile(sorted, 0.9),
        'p(95)': percentile(sorted, 0.95),
        'p(99)': percentile(sorted, 0.99),
    };
}

export function responseValid(endpoint, status, headers, bytes) {
    if (status !== 200) return false;
    if (endpoint.binary)
        return (
            headers['content-type']?.split(';')[0] === 'image/png' &&
            bytes.length === 65536 &&
            bytes[0] === 0x89 &&
            bytes[1] === 0x50
        );
    const text = bytes.toString('utf8');
    return (
        text.includes('</html>') &&
        endpoint.sentinel.test(text) &&
        text.includes(endpoint.additional)
    );
}

// Native HTTP never follows redirects. The complete compressed wire body is
// consumed before measuring RTT; decoding/validation do not discard slow samples.
/** @param {{request?: (options: import('node:http').RequestOptions, callback: (response: import('node:http').IncomingMessage) => void) => import('node:http').ClientRequest, clock?: () => number}} options */
export function requestEndpoint(endpoint, encoding, options = {}) {
    const { request = http.request, clock = () => performance.now() } = options;
    if (!PUBLIC_ENDPOINTS.includes(endpoint) || !['gzip', 'identity'].includes(encoding))
        throw new Error('Endpoint outside fixed public workload.');
    return new Promise((resolve) => {
        const started = clock();
        let completed = false;
        let req;
        const finish = (valid, errorCode = null, compressed = false) => {
            if (completed) return;
            completed = true;
            resolve({ durationMs: clock() - started, valid, errorCode, compressed });
        };
        try {
            req = request(
                {
                    protocol: 'http:',
                    hostname: 'spm-load-app',
                    port: 3000,
                    path: endpoint.path,
                    method: 'GET',
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                    headers: {
                        Host: 'localhost:3000',
                        Accept: endpoint.binary ? 'image/png' : 'text/html',
                        'Accept-Encoding': encoding,
                        'User-Agent': 'SPM-Isolated-Monotonic-Load-Test/1.0',
                    },
                },
                (response) => {
                    const chunks = [];
                    let size = 0;
                    response.on('data', (chunk) => {
                        size += chunk.length;
                        if (size > MAX_BODY_BYTES) {
                            req.destroy();
                            finish(false, 'BODY_LIMIT');
                        } else chunks.push(chunk);
                    });
                    response.on('error', () => finish(false, 'RESPONSE_ERROR'));
                    response.on('aborted', () => finish(false, 'RESPONSE_ABORTED'));
                    response.on('end', () => {
                        if (completed) return;
                        const durationMs = clock() - started;
                        const compressed = response.headers['content-encoding'] === 'gzip';
                        try {
                            const wire = Buffer.concat(chunks);
                            const bytes = compressed
                                ? gunzipSync(wire, { maxOutputLength: MAX_BODY_BYTES })
                                : wire;
                            const valid = responseValid(
                                endpoint,
                                response.statusCode,
                                response.headers,
                                bytes,
                            );
                            completed = true;
                            resolve({
                                durationMs,
                                valid,
                                errorCode: valid ? null : 'RESPONSE_CHECK',
                                compressed,
                            });
                        } catch {
                            finish(false, 'BODY_DECODE', compressed);
                        }
                    });
                },
            );
            req.on('error', () => finish(false, 'REQUEST_ERROR'));
            req.end();
        } catch {
            finish(false, 'REQUEST_ERROR');
        }
    });
}

export async function runArrivalPlan({
    stages,
    request,
    clock = () => performance.now(),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onPoint = () => {},
}) {
    const start = clock();
    let lastClock = start;
    let invalidClock = false;
    let sequence = 0;
    let peakInFlight = 0;
    const inFlight = new Set();
    const points = [];
    const stageCounts = [];
    const now = () => {
        const value = clock();
        if (!Number.isFinite(value) || value < lastClock) invalidClock = true;
        lastClock = value;
        return value;
    };
    for (const stage of stages) {
        const interval = 1000 / stage.rate;
        const expected = stage.rate * (stage.endSeconds - stage.startSeconds);
        const counts = {
            key: stage.key,
            expected,
            offered: 0,
            launched: 0,
            completed: 0,
            dropped: 0,
        };
        stageCounts.push(counts);
        while (counts.offered < expected && !invalidClock) {
            const due = start + stage.startSeconds * 1000 + counts.offered * interval;
            const current = now();
            if (invalidClock) break;
            if (current < due) {
                await wait(Math.min(due - current, 25));
                continue;
            }
            counts.offered++;
            // Do not turn scheduler stalls into an unbounded catch-up burst.
            if (current - due > Math.max(interval, 50) || inFlight.size >= MAX_IN_FLIGHT) {
                counts.dropped++;
                continue;
            }
            const endpoint = PUBLIC_ENDPOINTS[PUBLIC_MIX[sequence++ % PUBLIC_MIX.length]];
            const elapsedStartedMs = current - start;
            counts.launched++;
            const work = Promise.resolve()
                .then(() => request(endpoint))
                .catch(() => ({
                    durationMs: now() - current,
                    valid: false,
                    errorCode: 'REQUEST_ERROR',
                    compressed: false,
                }))
                .then((result) => {
                    counts.completed++;
                    const point = {
                        stage: stage.key,
                        endpoint: endpoint.key,
                        elapsedStartedMs,
                        durationMs: result.durationMs,
                        valid: result.valid === true,
                        compressed: result.compressed === true,
                        errorCode: result.errorCode,
                    };
                    points.push(point);
                    onPoint(point);
                })
                .finally(() => inFlight.delete(work));
            inFlight.add(work);
            peakInFlight = Math.max(peakInFlight, inFlight.size);
        }
    }
    const end = start + stages.at(-1).endSeconds * 1000;
    while (!invalidClock && now() < end) await wait(Math.min(end - lastClock, 25));
    await Promise.all(inFlight);
    const elapsedMs = now() - start;
    return { points, stageCounts, peakInFlight, elapsedMs, invalidClock };
}

export function makeMetrics(result, stages) {
    /** @type {Record<string, {values: Record<string, number | null>}>} */
    const metrics = {};
    const addGroup = (selector, points, elapsedSeconds) => {
        const invalid = points.filter((point) => !temporalSampleValid(point.durationMs)).length;
        const errors = points.filter((point) => !point.valid).length;
        metrics[`endpoint_requests${selector}`] = {
            values: { count: points.length, rate: points.length / elapsedSeconds },
        };
        // Preserve invalid raw durations here, too. Summarizer rejects them.
        metrics[`endpoint_duration${selector}`] = {
            values: trend(points.map((point) => point.durationMs)),
        };
        metrics[`endpoint_errors${selector}`] = {
            values: {
                rate: points.length ? errors / points.length : null,
                passes: errors,
                fails: points.length - errors,
            },
        };
        metrics[`invalid_timing${selector}`] = {
            values: {
                rate: points.length ? invalid / points.length : null,
                passes: invalid,
                fails: points.length - invalid,
            },
        };
    };
    const seconds = stages.at(-1).endSeconds;
    addGroup('', result.points, seconds);
    for (const stage of stages)
        addGroup(
            `{stage:${stage.key}}`,
            result.points.filter((point) => point.stage === stage.key),
            stage.endSeconds - stage.startSeconds,
        );
    for (const stage of result.stageCounts)
        metrics[`dropped_iterations{stage:${stage.key}}`] = { values: { count: stage.dropped } };
    for (const endpoint of PUBLIC_ENDPOINTS)
        addGroup(
            `{endpoint:${endpoint.key}}`,
            result.points.filter((point) => point.endpoint === endpoint.key),
            seconds,
        );
    metrics.http_req_duration = metrics.endpoint_duration;
    metrics.http_reqs = metrics.endpoint_requests;
    metrics.dropped_iterations = {
        values: { count: result.stageCounts.reduce((sum, stage) => sum + stage.dropped, 0) },
    };
    return metrics;
}

export function accountingValid(result) {
    return (
        result.stageCounts.every(
            (stage) =>
                [
                    stage.expected,
                    stage.offered,
                    stage.launched,
                    stage.completed,
                    stage.dropped,
                ].every((count) => Number.isSafeInteger(count) && count >= 0) &&
                stage.expected === stage.offered &&
                stage.offered === stage.launched + stage.dropped &&
                stage.launched === stage.completed,
        ) &&
        result.points.length ===
            result.stageCounts.reduce((sum, stage) => sum + stage.completed, 0) &&
        result.peakInFlight <= MAX_IN_FLIGHT &&
        !result.invalidClock &&
        temporalSampleValid(result.elapsedMs)
    );
}
