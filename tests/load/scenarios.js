/* global __ENV */
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';
import execution from 'k6/execution';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
    CAPACITY_RATES,
    CAPACITY_MAX_VUS,
    CAPACITY_STEPS,
    capacityStep,
    summarizeCapacity,
} from './capacity-plan.js';
import { recordTiming, summarizeTimingValidity } from './timing-validity.js';

// This harness is deliberately NOT a general-purpose tool for external sites.
// The orchestrator creates and removes a labelled, isolated Docker environment.
const BASE_URL = __ENV.BASE_URL;
const CANONICAL_ORIGIN = 'http://localhost:3000';
const RUN = __ENV.SPM_LOAD_RUN;
const PROFILE = __ENV.LOAD_PROFILE;
const ACCEPT_ENCODING = __ENV.LOAD_ENCODING ?? 'gzip';
const PROFILE_NAMES = [
    'smoke',
    'baseline',
    'stress',
    'recovery',
    'auth',
    'upload',
    'audience',
    'capacity',
];

if (BASE_URL !== 'http://spm-load-app:3000') {
    throw new Error('BASE_URL must be the fixed, isolated Docker application address.');
}
if (!/^spm-load-[a-f0-9]{16}$/.test(RUN || '')) {
    throw new Error('A valid isolated load-test run identifier is required.');
}
if (!PROFILE_NAMES.includes(PROFILE)) {
    throw new Error('LOAD_PROFILE must name one of the bounded load profiles.');
}
if (!['gzip', 'identity'].includes(ACCEPT_ENCODING)) {
    throw new Error('LOAD_ENCODING must be exactly gzip or identity.');
}
if (__ENV.K6_HTTP_DEBUG) {
    throw new Error('HTTP debug logging is forbidden because requests can contain a session.');
}

const AUTHENTICATED = ['auth', 'upload', 'audience'].includes(PROFILE);
const AUTH_COOKIE = AUTHENTICATED ? __ENV.AUTH_COOKIE : '';
if (AUTHENTICATED && !/^__Host-spm_session=[A-Za-z0-9_-]{43}$/.test(AUTH_COOKIE || '')) {
    throw new Error('An isolated, established production-format session cookie is required.');
}
const AUDIENCE_COOKIES = PROFILE === 'audience' ? JSON.parse(__ENV.AUTH_COOKIES || '[]') : [];
if (
    PROFILE === 'audience' &&
    (!Array.isArray(AUDIENCE_COOKIES) ||
        AUDIENCE_COOKIES.length !== 3 ||
        new Set(AUDIENCE_COOKIES).size !== 3 ||
        AUDIENCE_COOKIES.some((value) => !/^__Host-spm_session=[A-Za-z0-9_-]{43}$/.test(value)))
) {
    throw new Error('Audience requires three distinct isolated editor sessions.');
}

const PUBLIC_ENDPOINTS = [
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
    {
        key: 'public_media',
        path: '/api/arquivos/biblioteca/carga-0001.png',
        binary: true,
    },
];

const ADMIN_ENDPOINTS = [
    {
        key: 'admin_dashboard',
        path: '/admin',
        sentinel: /<h1[^>]*>Olá,[\s\S]*?<\/h1>/,
        additional: 'Aqui está o resumo do que está acontecendo',
    },
    {
        key: 'admin_news',
        path: '/admin/noticias',
        sentinel: /<h1[^>]*>Notícias<\/h1>/,
        additional: 'noticia-carga-0001',
    },
    {
        key: 'admin_media',
        path: '/admin/midia',
        sentinel: /<h1[^>]*>Biblioteca de mídia<\/h1>/,
        additional: '<title>Biblioteca de mídia | Painel SPM</title>',
    },
    {
        key: 'admin_cases',
        path: '/admin/atendimentos',
        sentinel: /<h1[^>]*>Atendimentos<\/h1>/,
        additional: '<title>Atendimentos | Painel SPM</title>',
    },
    {
        key: 'admin_messages',
        path: '/admin/mensagens',
        sentinel: /<h1[^>]*>Mensagens<\/h1>/,
        additional: '<title>Mensagens | Painel SPM</title>',
    },
];

const UPLOAD_ENDPOINT = { key: 'upload', path: '/api/admin/uploads?purpose=biblioteca' };
const EDITOR_ENDPOINTS = ADMIN_ENDPOINTS.slice(0, 3);
const ENDPOINTS =
    PROFILE === 'upload'
        ? [UPLOAD_ENDPOINT]
        : PROFILE === 'auth'
          ? ADMIN_ENDPOINTS
          : PROFILE === 'audience'
            ? [...PUBLIC_ENDPOINTS, ...EDITOR_ENDPOINTS]
            : PUBLIC_ENDPOINTS;

// A deterministic ten-request cycle preserves the public mix across all VUs.
const PUBLIC_MIX = [0, 0, 1, 2, 5, 3, 1, 2, 0, 4];
const REQUESTS = new Counter('endpoint_requests');
const ERRORS = new Rate('endpoint_errors');
const DURATION = new Trend('endpoint_duration', true);
const INVALID_TIMING = new Rate('invalid_timing');
const COMPRESSED = new Rate('response_compressed');
const EXPECTED_HTML = http.expectedStatuses(200);
const EXPECTED_UPLOAD = http.expectedStatuses(201);

function constant(rate, duration, preAllocatedVUs, maxVUs = preAllocatedVUs) {
    return {
        executor: 'constant-arrival-rate',
        rate,
        timeUnit: '1s',
        duration,
        preAllocatedVUs,
        maxVUs,
        gracefulStop: '10s',
    };
}

function stepped(rates, preAllocatedVUs, maxVUs) {
    return {
        executor: 'ramping-arrival-rate',
        startRate: rates[0],
        timeUnit: '1s',
        preAllocatedVUs,
        maxVUs,
        stages: rates.flatMap((rate, index) => [
            ...(index ? [{ duration: '1s', target: rate }] : []),
            { duration: '30s', target: rate },
        ]),
        gracefulStop: '10s',
    };
}

const PLANS = {
    capacity: stepped(CAPACITY_RATES, 40, CAPACITY_MAX_VUS),
    smoke: constant(2, '30s', 10),
    baseline: stepped([5, 10, 20], 40, 100),
    stress: stepped([30, 50, 75], 100, 100),
    recovery: constant(10, '30s', 30, 100),
    auth: stepped([5, 10, 20], 40, 100),
    // Below the real 30 uploads/15 min/user limit. No application limits change.
    upload: constant(1, '25s', 8, 8),
};
// Closed workload: real simultaneous virtual journeys, not 50 HTTP requests/s.
// Think time is part of this contract; achieved request rate falls when latency rises.
const AUDIENCE_PLAN = {
    readers: {
        executor: 'constant-vus',
        vus: 50,
        duration: '180s',
        gracefulStop: '15s',
        exec: 'readerJourney',
    },
    editors: {
        executor: 'constant-vus',
        vus: 3,
        duration: '180s',
        gracefulStop: '15s',
        exec: 'editorJourney',
    },
};
const P95_MS = PROFILE === 'upload' ? 2000 : ['auth', 'audience'].includes(PROFILE) ? 1500 : 1000;
const P99_MS = ['upload', 'auth', 'audience'].includes(PROFILE) ? 3000 : 2000;
const THRESHOLDS = {
    http_req_duration: ['min>=0', `p(95)<${P95_MS}`, `p(99)<${P99_MS}`],
    invalid_timing: ['rate==0'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    dropped_iterations: ['count==0'],
    endpoint_errors: ['rate<0.01'],
    // Observational only: PNGs and small JSON responses need not be compressed.
    response_compressed: ['rate>=0'],
};
if (PROFILE === 'capacity') {
    // Per-stage metrics locate the first SLO saturation point. Safety aborts
    // stop a persistently unhealthy local experiment rather than piling up load.
    THRESHOLDS.http_req_failed = [
        { threshold: 'rate<0.20', abortOnFail: true, delayAbortEval: '30s' },
        'rate<0.01',
    ];
    for (const stage of CAPACITY_STEPS) {
        const selector = `{stage:${stage.key}}`;
        THRESHOLDS[`endpoint_requests${selector}`] = ['count>0'];
        THRESHOLDS[`endpoint_duration${selector}`] = ['min>=0', 'p(95)<1000', 'p(99)<2000'];
        THRESHOLDS[`invalid_timing${selector}`] = ['rate==0'];
        THRESHOLDS[`endpoint_errors${selector}`] = ['rate<0.01'];
    }
}

// Tagged submetrics are explicitly materialized in the JSON summary. Every
// endpoint has its own SLO, so a quick static route cannot hide a slow admin one.
for (const endpoint of ENDPOINTS) {
    const selector = `{endpoint:${endpoint.key}}`;
    const publicAudience = PROFILE === 'audience' && !endpoint.key.startsWith('admin_');
    THRESHOLDS[`endpoint_requests${selector}`] = ['count>0'];
    THRESHOLDS[`endpoint_duration${selector}`] = [
        'min>=0',
        `p(95)<${publicAudience ? 1000 : P95_MS}`,
        `p(99)<${publicAudience ? 2000 : P99_MS}`,
    ];
    THRESHOLDS[`endpoint_errors${selector}`] = ['rate<0.01'];
    THRESHOLDS[`invalid_timing${selector}`] = ['rate==0'];
    THRESHOLDS[`response_compressed${selector}`] = ['rate>=0'];
}

// Observational subdivisions only: the original all-request SLOs above remain
// unchanged and include startup. The JSON points retain timestamps without
// bodies, cookie values or credentials, so a burst is not guessed from p99 alone.
const OBSERVATION_WINDOWS = ['initial_15s', 'steady_after_15s'];
if (PROFILE === 'audience') {
    for (const window of OBSERVATION_WINDOWS) {
        THRESHOLDS[`endpoint_requests{window:${window}}`] = ['count>=0'];
        THRESHOLDS[`endpoint_duration{window:${window}}`] = ['p(95)>=0'];
        for (const endpoint of ENDPOINTS) {
            const selector = `{endpoint:${endpoint.key},window:${window}}`;
            THRESHOLDS[`endpoint_requests${selector}`] = ['count>=0'];
            THRESHOLDS[`endpoint_duration${selector}`] = ['p(95)>=0'];
        }
    }
}

export const options = {
    scenarios: PROFILE === 'audience' ? AUDIENCE_PLAN : { [PROFILE]: PLANS[PROFILE] },
    thresholds: THRESHOLDS,
    maxRedirects: 0,
    throw: false,
    // These requests explicitly request text for validation, retained only until
    // the iteration ends. No response bodies, credentials or PII are exported.
    discardResponseBodies: true,
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    systemTags: ['status', 'method', 'name', 'scenario', 'expected_response', 'error_code'],
    userAgent: 'SPM-Isolated-Load-Test/1.0',
};

function params(endpoint, expected) {
    const cookie =
        PROFILE === 'audience'
            ? endpoint.key.startsWith('admin_')
                ? AUDIENCE_COOKIES[(execution.vu.idInTest - 1) % AUDIENCE_COOKIES.length]
                : ''
            : AUTH_COOKIE;
    return {
        redirects: 0,
        timeout: '8s',
        responseType: 'text',
        responseCallback: expected,
        tags: {
            endpoint: endpoint.key,
            name: endpoint.path,
            ...(PROFILE === 'capacity'
                ? { stage: capacityStep(Date.now() - execution.scenario.startTime) }
                : {}),
            ...(PROFILE === 'audience'
                ? {
                      window:
                          Date.now() - execution.scenario.startTime < 15000
                              ? 'initial_15s'
                              : 'steady_after_15s',
                  }
                : {}),
        },
        headers: {
            Host: 'localhost:3000',
            Accept: 'text/html',
            'Accept-Encoding': ACCEPT_ENCODING,
            ...(cookie ? { Cookie: cookie } : {}),
        },
    };
}

function record(response, endpoint, valid, window, stage) {
    const tags = {
        endpoint: endpoint.key,
        ...(window ? { window } : {}),
        ...(stage ? { stage } : {}),
    };
    REQUESTS.add(1, tags);
    ERRORS.add(!valid, tags);
    recordTiming(response.timings, tags, DURATION, INVALID_TIMING);
    COMPRESSED.add(
        (response.headers['Content-Encoding'] || '').toLowerCase().includes('gzip'),
        tags,
    );
}

function visit(endpoint) {
    const requestParams = params(endpoint, EXPECTED_HTML);
    if (endpoint.binary) {
        requestParams.responseType = 'binary';
        requestParams.headers.Accept = 'image/png';
    }
    const response = http.get(`${BASE_URL}${endpoint.path}`, requestParams);
    if (endpoint.binary) {
        const valid = check(
            response,
            {
                'public media status is 200, without redirects': (value) => value.status === 200,
                'public media has the expected PNG content type and 64 KiB size': (value) =>
                    value.headers['Content-Type']?.split(';')[0] === 'image/png' &&
                    value.body instanceof ArrayBuffer &&
                    value.body.byteLength === 64 * 1024 &&
                    new Uint8Array(value.body)[0] === 0x89 &&
                    new Uint8Array(value.body)[1] === 0x50,
            },
            { endpoint: endpoint.key },
        );
        record(response, endpoint, valid, requestParams.tags.window, requestParams.tags.stage);
        return;
    }
    const valid = check(
        response,
        {
            'HTML status is 200, without redirects': (value) => value.status === 200,
            'expected page content was rendered': (value) =>
                typeof value.body === 'string' &&
                value.body.includes('</html>') &&
                endpoint.sentinel.test(value.body) &&
                value.body.includes(endpoint.additional),
        },
        { endpoint: endpoint.key },
    );
    record(response, endpoint, valid, requestParams.tags.window, requestParams.tags.stage);
}

// A tiny, valid PNG header/image followed by padding: exactly 64 KiB. This
// exercises transport, signature validation, storage and DB writes, NOT image
// decoding or antivirus analysis. It never uploads existing user files.
const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6HAAAAABJRU5ErkJggg==';
const UPLOAD_BYTES = 64 * 1024;
const png = new Uint8Array(UPLOAD_BYTES);
png.set(new Uint8Array(encoding.b64decode(PNG_BASE64)));

function upload() {
    // Absolute cap, even at a scheduler boundary or with an accidental CLI
    // duration override; no retry, follow-up GET or deletion doubles the load.
    if (execution.scenario.iterationInTest >= 25) return;
    const requestParams = params(UPLOAD_ENDPOINT, EXPECTED_UPLOAD);
    requestParams.headers = {
        ...requestParams.headers,
        Accept: 'application/json',
        Origin: CANONICAL_ORIGIN,
        'Content-Type': 'application/octet-stream',
        'X-File-Name': 'carga-sintetica.png',
    };
    // The production endpoint accepts raw bytes, not multipart/form-data.
    const response = http.post(`${BASE_URL}${UPLOAD_ENDPOINT.path}`, png.buffer, requestParams);
    let payload = null;
    try {
        payload = response.json();
    } catch {
        // Treat malformed JSON as a failed check; never print the response body.
    }
    const valid = check(
        response,
        {
            'upload status is 201, without redirects': (value) => value.status === 201,
            'upload persisted a 64 KiB PNG with a private application URL': () =>
                payload?.ok === true &&
                typeof payload?.media?.id === 'string' &&
                payload.media.id.length > 0 &&
                payload.media.mimeType === 'image/png' &&
                payload.media.originalName === 'carga-sintetica.png' &&
                payload.media.size === UPLOAD_BYTES &&
                typeof payload.media.url === 'string' &&
                /^\/api\/arquivos\/biblioteca\//.test(payload.media.url),
        },
        { endpoint: UPLOAD_ENDPOINT.key },
    );
    record(response, UPLOAD_ENDPOINT, valid, requestParams.tags.window, requestParams.tags.stage);
}

export default function runProfile() {
    // Exactly one HTTP request per iteration. Arrival-rate executors pace it;
    // sleeps here would reduce achievable throughput and mask saturation.
    if (PROFILE === 'upload') return upload();
    const iteration = execution.scenario.iterationInTest;
    const index =
        PROFILE === 'auth'
            ? iteration % ADMIN_ENDPOINTS.length
            : PUBLIC_MIX[iteration % PUBLIC_MIX.length];
    visit(ENDPOINTS[index]);
}

export function readerJourney() {
    const step = execution.vu.iterationInScenario + execution.vu.idInTest - 1;
    visit(PUBLIC_ENDPOINTS[PUBLIC_MIX[step % PUBLIC_MIX.length]]);
    sleep(2 + (step % 4));
}

export function editorJourney() {
    const step = execution.vu.iterationInScenario + execution.vu.idInTest - 1;
    visit(EDITOR_ENDPOINTS[step % EDITOR_ENDPOINTS.length]);
    sleep(4 + (step % 4));
}

export function handleSummary(data) {
    const timingValidity = summarizeTimingValidity(data.metrics);
    const failures = [];
    for (const [metric, result] of Object.entries(data.metrics)) {
        for (const [threshold, outcome] of Object.entries(result.thresholds || {})) {
            if (!outcome.ok) failures.push({ metric, threshold });
        }
    }
    const endpoints = Object.fromEntries(
        ENDPOINTS.map((endpoint) => {
            const selector = `{endpoint:${endpoint.key}}`;
            return [
                endpoint.key,
                {
                    path: endpoint.path,
                    requests: data.metrics[`endpoint_requests${selector}`]?.values || null,
                    durationMs: data.metrics[`endpoint_duration${selector}`]?.values || null,
                    errors: data.metrics[`endpoint_errors${selector}`]?.values || null,
                    compressedResponses:
                        data.metrics[`response_compressed${selector}`]?.values || null,
                },
            ];
        }),
    );
    const summary = {
        ...data,
        loadTest: {
            schemaVersion: 1,
            run: RUN,
            profile: PROFILE,
            timingValidity,
            capacity: PROFILE === 'capacity' ? summarizeCapacity(data.metrics) : null,
            generatedAt: new Date().toISOString(),
            observations:
                PROFILE === 'audience'
                    ? {
                          windows: Object.fromEntries(
                              OBSERVATION_WINDOWS.map((window) => [
                                  window,
                                  {
                                      requests:
                                          data.metrics[`endpoint_requests{window:${window}}`]
                                              ?.values || null,
                                      durationMs:
                                          data.metrics[`endpoint_duration{window:${window}}`]
                                              ?.values || null,
                                      endpoints: Object.fromEntries(
                                          ENDPOINTS.map((endpoint) => {
                                              const selector = `{endpoint:${endpoint.key},window:${window}}`;
                                              return [
                                                  endpoint.key,
                                                  {
                                                      requests:
                                                          data.metrics[
                                                              `endpoint_requests${selector}`
                                                          ]?.values || null,
                                                      durationMs:
                                                          data.metrics[
                                                              `endpoint_duration${selector}`
                                                          ]?.values || null,
                                                  },
                                              ];
                                          }),
                                      ),
                                  },
                              ]),
                          ),
                          timestampsFile: 'audience-points.json',
                          classification:
                              'request start < 15000 ms from scenario start vs the rest; no warm-up requests excluded from SLOs',
                          purpose:
                              'diagnostic only; original aggregate/per-route thresholds still include every request',
                      }
                    : null,
            target: BASE_URL,
            acceptEncoding: ACCEPT_ENCODING,
            plan: PROFILE === 'audience' ? AUDIENCE_PLAN : PLANS[PROFILE],
            oneRequestPerIteration: true,
            workload:
                PROFILE === 'audience'
                    ? '50 concurrent reader VUs + 3 concurrent editor VUs, with explicit think time'
                    : AUTHENTICATED
                      ? 'established-session'
                      : 'public-html-and-media',
            thinkTimeSeconds: PROFILE === 'audience' ? { readers: [2, 5], editors: [4, 7] } : null,
            publicMix: {
                home: 0.3,
                blog: 0.2,
                article: 0.2,
                agenda: 0.1,
                about: 0.1,
                public_media: 0.1,
            },
            authMix:
                PROFILE === 'auth'
                    ? 'five routes with equal weight'
                    : PROFILE === 'audience'
                      ? 'three editorial routes with equal weight; distinct established sessions'
                      : null,
            limits: {
                requestTimeoutMs: 8000,
                redirects: 0,
                p95Ms: P95_MS,
                p99Ms: P99_MS,
                errorRateExclusive: 0.01,
                checkRateExclusive: 0.99,
                droppedIterations: 0,
                ...(PROFILE === 'upload' ? { maximumUploads: 25, uploadBytes: UPLOAD_BYTES } : {}),
            },
            limitations: [
                'Local isolated Docker measurement, not Google Cloud capacity or browser Web Vitals.',
                'No external images, CDN, CSS/JS assets, SMTP, OAuth, Calendar or GCS are requested.',
                'The blog uses server-side pagination and category filtering, without a full-text search query.',
                'Article reads increment a synthetic record view counter in the isolated database.',
                ...(PROFILE === 'audience'
                    ? [
                          'Closed workload with think time models 50 readers and 3 editors; it is not maximum capacity, 50 requests/s or a soak test.',
                      ]
                    : []),
                ...(AUTHENTICATED
                    ? [
                          'Uses established synthetic Workspace sessions; does not measure Google login, provider availability or real two-factor authentication.',
                      ]
                    : []),
                ...(PROFILE === 'upload'
                    ? [
                          'The padded PNG fixture tests transport/storage, not decoding, malware detection or 10 MiB files.',
                      ]
                    : []),
            ],
            endpoints,
            thresholdFailures: failures,
            passed: failures.length === 0 && timingValidity.valid,
        },
    };
    const duration = data.metrics.http_req_duration?.values || {};
    const requests = data.metrics.http_reqs?.values?.count || 0;
    const errorRate = data.metrics.endpoint_errors?.values?.rate || 0;
    const dropped = data.metrics.dropped_iterations?.values?.count || 0;
    const formatMs = (number) => (typeof number === 'number' ? number.toFixed(1) : 'n/a');
    return {
        [`/results/${PROFILE}.json`]: JSON.stringify(summary, null, 2),
        stdout:
            `[SPM ${PROFILE}] ${!timingValidity.valid ? 'INVALID TIMING' : failures.length ? 'FAILED' : 'PASSED'}: ` +
            `${requests} requests; p95=${formatMs(duration['p(95)'])} ms; ` +
            `p99=${formatMs(duration['p(99)'])} ms; ` +
            `errors=${(errorRate * 100).toFixed(2)}%; dropped=${dropped}; ` +
            `failed thresholds=${failures.length}.\n`,
    };
}
