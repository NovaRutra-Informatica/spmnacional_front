import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    recordTiming,
    summarizeTimingValidity,
    validDurationValues,
} from '../load/timing-validity';

const normal = {
    duration: 9,
    blocked: 0,
    connecting: 0,
    tls_handshaking: 0,
    sending: 1,
    waiting: 7,
    receiving: 1,
};
const tags = { endpoint: 'article', stage: 'rps_75' };

describe('evidência temporal do gerador isolado', () => {
    it('cada fase deve ser finita e não negativa, inclusive duração zero legítima', () => {
        for (const field of Object.keys(normal)) {
            for (const invalid of [-2003.851429, NaN, Infinity, undefined]) {
                const timings = { ...normal, [field]: invalid };
                const duration = { add: vi.fn() };
                const marker = { add: vi.fn() };
                expect(recordTiming(timings, tags, duration, marker)).toBe(false);
                expect(marker.add).toHaveBeenCalledWith(true, tags);
                expect(duration.add).not.toHaveBeenCalled();
                expect(timings[field as keyof typeof timings]).toBe(invalid);
            }
        }
        const duration = { add: vi.fn() };
        const marker = { add: vi.fn() };
        expect(recordTiming(undefined, tags, duration, marker)).toBe(false);
        expect(recordTiming({ ...normal, duration: 0 }, tags, duration, marker)).toBe(true);
        expect(duration.add).toHaveBeenCalledExactlyOnceWith(0, tags);
        expect(marker.add).toHaveBeenLastCalledWith(false, tags);
    });
    it('executa record real e mantém contagem/checks enquanto sinaliza a amostra inválida', () => {
        const source = readFileSync(new URL('../load/scenarios.js', import.meta.url), 'utf8');
        const implementation = source.match(/function record\([^]*?\n}\r?\n\r?\nfunction visit/);
        expect(implementation).not.toBeNull();
        const metrics = Array.from({ length: 4 }, () => ({ add: vi.fn() }));
        const record = new Function(
            'REQUESTS',
            'ERRORS',
            'DURATION',
            'COMPRESSED',
            'INVALID_TIMING',
            'recordTiming',
            `${implementation![0].replace(/\r?\n\r?\nfunction visit$/, '')}; return record;`,
        )(...metrics, { add: vi.fn() }, recordTiming);
        const response = {
            timings: { ...normal, duration: -2003.851429 },
            headers: { 'Content-Encoding': 'gzip' },
        };
        record(response, { key: 'article' }, true, undefined, 'rps_75');
        expect(metrics[0].add).toHaveBeenCalledWith(1, tags);
        expect(metrics[1].add).toHaveBeenCalledWith(false, tags);
        expect(metrics[2].add).not.toHaveBeenCalled();
        expect(metrics[3].add).toHaveBeenCalledWith(true, tags);
        expect(response.timings.duration).toBe(-2003.851429);
        expect(source).toContain("invalid_timing: ['rate==0']");
        expect(source).toContain('passed: failures.length === 0 && timingValidity.valid');
    });
    it('rejeita dados agregados incompletos e fases negativas fora da duração total', () => {
        const trend = { min: 0, 'p(95)': 1, 'p(99)': 2 };
        const metrics: Record<string, { values: Record<string, number> }> = {
            http_req_duration: { values: trend },
            endpoint_duration: { values: trend },
            invalid_timing: { values: { rate: 0, passes: 0, fails: 1 } },
        };
        expect(summarizeTimingValidity(metrics).valid).toBe(true);
        expect(validDurationValues(undefined)).toBe(false);
        expect(validDurationValues({ 'p(95)': 1, 'p(99)': 2 })).toBe(false);
        metrics.http_req_waiting = { values: { min: -1 } };
        expect(summarizeTimingValidity(metrics).reasons).toContain(
            'invalid_temporal_value:http_req_waiting',
        );
        delete metrics.http_req_waiting;
        for (const marker of [
            { rate: NaN, passes: 0, fails: 1 },
            { rate: -1, passes: 0, fails: 1 },
            { rate: 2, passes: 0, fails: 1 },
            { rate: 0, passes: -1, fails: 1 },
            { rate: 0, passes: 0, fails: NaN },
            { rate: 0, passes: 0, fails: -1 },
            { rate: 0, passes: 0, fails: 0 },
        ]) {
            metrics.invalid_timing = { values: marker };
            expect(summarizeTimingValidity(metrics).valid).toBe(false);
        }
        metrics.invalid_timing = { values: { rate: 0, passes: 1, fails: 1 } };
        expect(summarizeTimingValidity(metrics).reasons).toContain('invalid_response_timing');
    });
});
