import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    accountingValid,
    makeMetrics,
    MAX_BODY_BYTES,
    MAX_IN_FLIGHT,
    percentile,
    PUBLIC_ENDPOINTS,
    requestEndpoint,
    responseValid,
    runArrivalPlan,
    trend,
    validateMonotonicConfig,
} from '../load/monotonic-core.mjs';
import { summarizeCapacity } from '../load/capacity-plan.js';
import { CAPACITY_STEPS } from '../load/capacity-plan.js';
import { summarizeTimingValidity } from '../load/timing-validity.js';

const safeEnv = {
    BASE_URL: 'http://spm-load-app:3000',
    LOAD_PROFILE: 'capacity',
    SPM_LOAD_RUN: 'spm-load-0123456789abcdef',
    LOAD_ENCODING: 'gzip',
};
const stages = [{ key: 'rps_10', rate: 10, startSeconds: 0, endSeconds: 1 }];
const completed = { durationMs: 10, valid: true, compressed: false, errorCode: null };

describe('motor monotônico público isolado', () => {
    it('rejeita perfil/URL/encoding/token/ID fora do contrato fixo', () => {
        expect(validateMonotonicConfig(safeEnv)).toEqual({
            run: safeEnv.SPM_LOAD_RUN,
            encoding: 'gzip',
        });
        for (const override of [
            { BASE_URL: 'https://example.test' },
            { BASE_URL: 'http://spm-load-app:3000.evil' },
            { LOAD_PROFILE: 'auth' },
            { LOAD_ENCODING: 'br' },
            { SPM_LOAD_RUN: 'other' },
            { AUTH_COOKIE: 'secret' },
            { AUTH_COOKIES: '[]' },
            { K6_HTTP_DEBUG: 'full' },
        ])
            expect(() => validateMonotonicConfig({ ...safeEnv, ...override })).toThrow();
        expect(() => requestEndpoint({ ...PUBLIC_ENDPOINTS[0] }, 'gzip')).toThrow();
        expect(() => requestEndpoint(PUBLIC_ENDPOINTS[0], 'br')).toThrow();
    });
    it('mede percentis por interpolação sem remover mínimos inválidos', () => {
        expect(percentile([], 0.95)).toBeNull();
        expect(percentile([10, 20], 0.95)).toBeCloseTo(19.5);
        expect(trend([30, 10, 20])).toMatchObject({ min: 10, max: 30, med: 20, avg: 20 });
        expect(trend([-2000, 10]).min).toBe(-2000);
        expect(trend([NaN, 10])['p(95)']).toBeNaN();
    });
    it('agendamento/atribuição usam o relógio monotônico e mantêm o ciclo público exato', async () => {
        let clock = 0;
        const result = await runArrivalPlan({
            stages,
            clock: () => clock,
            wait: async (ms) => {
                clock += ms;
            },
            request: async () => completed,
        });
        expect(result.points).toHaveLength(10);
        expect(result.points.map((point: { endpoint: string }) => point.endpoint)).toEqual([
            'home',
            'home',
            'blog',
            'article',
            'public_media',
            'agenda',
            'blog',
            'article',
            'home',
            'about',
        ]);
        expect(
            result.points.map((point: { elapsedStartedMs: number }) => point.elapsedStartedMs),
        ).toEqual(Array.from({ length: 10 }, (_, i) => i * 100));
        expect(result.elapsedMs).toBe(1000);
        expect(accountingValid(result)).toBe(true);
        const metrics = makeMetrics(result, stages);
        expect(summarizeTimingValidity(metrics).valid).toBe(true);
        expect(metrics.endpoint_requests.values.count).toBe(10);
        expect(metrics.dropped_iterations.values.count).toBe(0);
    });
    it('limita 200 simultâneas e contabiliza pedidos não iniciados, sem descartá-los do relatório', async () => {
        let clock = 0;
        const pending: Array<(value: typeof completed) => void> = [];
        const result = await runArrivalPlan({
            stages: [{ key: 'rps_200', rate: 200, startSeconds: 0, endSeconds: 2 }],
            clock: () => clock,
            wait: async (ms) => {
                clock += ms;
                if (clock >= 2000) for (const done of pending) done(completed);
            },
            request: () => new Promise((done) => pending.push(done)),
        });
        expect(result.peakInFlight).toBe(MAX_IN_FLIGHT);
        expect(result.stageCounts[0]).toMatchObject({
            expected: 400,
            offered: 400,
            launched: 200,
            completed: 200,
            dropped: 200,
        });
        expect(accountingValid(result)).toBe(true);
        expect(
            makeMetrics(result, [{ key: 'rps_200', rate: 200, startSeconds: 0, endSeconds: 2 }])
                .dropped_iterations.values.count,
        ).toBe(200);
    });
    it('não transforma atraso do gerador em rajada de compensação', async () => {
        let clock = 0;
        let stalled = false;
        const result = await runArrivalPlan({
            stages: [{ ...stages[0], endSeconds: 2 }],
            clock: () => clock,
            wait: async (ms) => {
                clock += ms + (stalled ? 0 : 500);
                stalled = true;
            },
            request: async () => completed,
        });
        expect(result.stageCounts[0].dropped).toBeGreaterThan(0);
        expect(result.points.length).toBeLessThan(20);
        expect(accountingValid(result)).toBe(true);
    });
    it('retrocesso/NaN de relógio ou inconsistência de contagens invalidam a evidência', async () => {
        let calls = 0;
        const result = await runArrivalPlan({
            stages,
            clock: () => (calls++ === 0 ? 10 : 0),
            wait: async () => {},
            request: async () => completed,
        });
        expect(result.invalidClock).toBe(true);
        expect(accountingValid(result)).toBe(false);
        const invalid = {
            points: [],
            stageCounts: [
                { expected: Infinity, offered: 0, launched: 0, completed: 0, dropped: 0 },
            ],
            peakInFlight: 0,
            invalidClock: false,
            elapsedMs: 1000,
        };
        expect(accountingValid(invalid)).toBe(false);
        expect(accountingValid({ ...invalid, stageCounts: [], elapsedMs: NaN })).toBe(false);
    });
    it('duração negativa não pode virar aprovação mesmo com respostas válidas', () => {
        const result = {
            points: [
                {
                    stage: 'rps_2',
                    endpoint: 'home',
                    durationMs: -2003,
                    valid: true,
                    compressed: false,
                },
            ],
            stageCounts: [
                { key: 'rps_2', expected: 1, offered: 1, launched: 1, completed: 1, dropped: 0 },
            ],
            peakInFlight: 1,
            invalidClock: false,
            elapsedMs: 1000,
        };
        const metrics = makeMetrics(result, CAPACITY_STEPS);
        expect(metrics.http_req_duration.values.min).toBe(-2003);
        expect(metrics.invalid_timing.values.passes).toBe(1);
        expect(summarizeCapacity(metrics).highestConsecutivePassingRps).toBe(0);
    });
});

describe('HTTP nativo real, completo e sem redirecionamento externo', () => {
    let server: http.Server;
    let port: number;
    let mode = 'html';
    const observed: http.RequestOptions[] = [];
    beforeAll(async () => {
        server = http.createServer((_request, response) => {
            if (mode === 'redirect') {
                response.writeHead(302, { Location: 'https://example.test/never' });
                response.end();
                return;
            }
            if (mode === 'large') {
                response.end(Buffer.alloc(MAX_BODY_BYTES + 1));
                return;
            }
            if (mode === 'bad_gzip') {
                response.writeHead(200, { 'Content-Encoding': 'gzip' });
                response.end('invalid');
                return;
            }
            if (mode === 'truncated_gzip') {
                response.writeHead(200, { 'Content-Encoding': 'gzip' });
                response.end(gzipSync('fixture').subarray(0, -4));
                return;
            }
            if (mode === 'aborted') {
                response.writeHead(200);
                response.write('<html>partial');
                setTimeout(() => response.destroy(), 20);
                return;
            }
            if (mode === 'hung') {
                response.writeHead(200);
                response.write('<html>partial');
                return;
            }
            const html =
                '<html><body class="home-page">Destaques do Serviço Pastoral dos Migrantes</body></html>';
            response.writeHead(200, mode === 'gzip' ? { 'Content-Encoding': 'gzip' } : {});
            response.flushHeaders();
            if (mode === 'html') response.write(html);
            setTimeout(
                () => response.end(mode === 'gzip' ? gzipSync(html) : '<!-- delayed tail -->'),
                25,
            );
        });
        await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
        port = (server.address() as { port: number }).port;
    });
    afterAll(async () => {
        await new Promise<void>((done) => server.close(() => done()));
    });
    const request = (
        options: http.RequestOptions,
        callback: (response: http.IncomingMessage) => void,
    ) => {
        observed.push(options);
        return http.request({ ...options, hostname: '127.0.0.1', port }, callback);
    };
    it('RTT inclui espera e leitura integral do corpo, preserva Host e nunca usa cookies', async () => {
        mode = 'html';
        const result = await requestEndpoint(PUBLIC_ENDPOINTS[0], 'identity', { request });
        expect(result.valid).toBe(true);
        expect(result.durationMs).toBeGreaterThanOrEqual(20);
        expect(observed.at(-1)).toMatchObject({
            hostname: 'spm-load-app',
            port: 3000,
            path: '/',
            headers: { Host: 'localhost:3000', 'Accept-Encoding': 'identity' },
        });
        expect(observed.at(-1)?.headers).not.toHaveProperty('Cookie');
    });
    it('gzip é decodificado apenas transitoriamente e nunca é exportado o conteúdo', async () => {
        mode = 'gzip';
        const result = await requestEndpoint(PUBLIC_ENDPOINTS[0], 'gzip', { request });
        expect(result).toMatchObject({ valid: true, compressed: true });
        expect(Object.keys(result).sort()).toEqual([
            'compressed',
            'durationMs',
            'errorCode',
            'valid',
        ]);
    });
    it.each(['redirect', 'large', 'bad_gzip', 'truncated_gzip', 'aborted'])(
        '%s falha sem sair do endpoint nem revelar resposta',
        async (value) => {
            mode = value;
            const before = observed.length;
            const result = await requestEndpoint(PUBLIC_ENDPOINTS[0], 'gzip', { request });
            expect(result.valid).toBe(false);
            expect(observed.length - before).toBe(1);
            expect(result.errorCode).toMatch(
                /^(RESPONSE_CHECK|BODY_LIMIT|BODY_DECODE|RESPONSE_ABORTED|RESPONSE_ERROR)$/,
            );
        },
    );
    it('deadline de 8s encerra corpo que nunca termina, sem deixar a amostra fora do SLO', async () => {
        mode = 'hung';
        const result = await requestEndpoint(PUBLIC_ENDPOINTS[0], 'identity', { request });
        expect(result.valid).toBe(false);
        expect(result.durationMs).toBeGreaterThanOrEqual(7900);
        expect(result.durationMs).toBeLessThan(9500);
        expect(result.errorCode).toMatch(/^(REQUEST_ERROR|RESPONSE_ABORTED|RESPONSE_ERROR)$/);
    }, 10_000);
    it('binário exige PNG exato de 64 KiB', () => {
        const bytes = Buffer.alloc(65536);
        bytes[0] = 0x89;
        bytes[1] = 0x50;
        expect(
            responseValid(PUBLIC_ENDPOINTS[5], 200, { 'content-type': 'image/png' }, bytes),
        ).toBe(true);
        expect(
            responseValid(PUBLIC_ENDPOINTS[5], 200, { 'content-type': 'text/html' }, bytes),
        ).toBe(false);
        expect(
            responseValid(
                PUBLIC_ENDPOINTS[5],
                200,
                { 'content-type': 'image/png' },
                Buffer.alloc(2),
            ),
        ).toBe(false);
    });
});
