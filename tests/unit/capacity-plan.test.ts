import { describe, expect, it } from 'vitest';
import {
    CAPACITY_RATES,
    CAPACITY_MAX_VUS,
    CAPACITY_STEPS,
    capacityStep,
    summarizeCapacity,
} from '../load/capacity-plan';

function completeMetrics() {
    const metrics: Record<string, { values: Record<string, number> }> = {
        http_req_duration: { values: { min: 1, 'p(95)': 500, 'p(99)': 900 } },
        endpoint_duration: { values: { min: 1, 'p(95)': 500, 'p(99)': 900 } },
        invalid_timing: { values: { rate: 0, passes: 0, fails: 10_000 } },
    };
    for (const step of CAPACITY_STEPS) {
        const selector = `{stage:${step.key}}`;
        metrics[`endpoint_requests${selector}`] = {
            values: { count: step.rate * (step.endSeconds - step.startSeconds) },
        };
        metrics[`endpoint_duration${selector}`] = {
            values: { min: 1, 'p(95)': 500, 'p(99)': 900 },
        };
        metrics[`endpoint_errors${selector}`] = { values: { rate: 0 } };
    }
    return metrics;
}

describe('ensaio local progressivo com limite e critérios por estágio', () => {
    it('cap e duração são fixos e as fronteiras de estágio são exclusivas', () => {
        expect(CAPACITY_RATES).toEqual([2, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200]);
        expect(CAPACITY_MAX_VUS).toBe(200);
        expect(capacityStep(29_999)).toBe('rps_2');
        expect(capacityStep(30_000)).toBe('rps_5');
        expect(capacityStep(216_000)).toBe('rps_100');
        expect(capacityStep(247_000)).toBe('rps_125');
        expect(capacityStep(278_000)).toBe('rps_150');
        expect(capacityStep(309_000)).toBe('rps_200');
        expect(capacityStep(340_000)).toBe('complete');
        expect(Object.isFrozen(CAPACITY_RATES)).toBe(true);
        expect(Object.isFrozen(CAPACITY_STEPS)).toBe(true);
    });
    it('relata somente a faixa consecutiva válida e não confunde cap com capacidade máxima', () => {
        const metrics = completeMetrics();
        let result = summarizeCapacity(metrics);
        expect(result.highestConsecutivePassingRps).toBe(200);
        expect(result.testedCapRps).toBe(200);
        expect(result.firstNonPassingRps).toBeNull();
        expect(result.interpretation).toContain('lower bound');
        metrics['endpoint_duration{stage:rps_20}'].values['p(95)'] = 1200;
        result = summarizeCapacity(metrics);
        expect(result.highestConsecutivePassingRps).toBe(10);
        expect(result.firstNonPassingRps).toBe(20);
        expect(result.throughputOnlyFailure).toBe(false);
        // Fast responses cannot hide dropped offered load.
        metrics['endpoint_requests{stage:rps_5}'].values.count = 1;
        const throughputLimited = summarizeCapacity(metrics);
        expect(throughputLimited.highestConsecutivePassingRps).toBe(2);
        expect(throughputLimited.throughputOnlyFailure).toBe(true);
        expect(throughputLimited.interpretation).toContain('Check generator');
    });
    it('não trata métricas ausentes como sucesso nem inventa capacidade em falha do gerador', () => {
        const result = summarizeCapacity({});
        expect(result.highestConsecutivePassingRps).toBe(0);
        expect(result.firstNonPassingRps).toBe(2);
        expect(result.steps.every((step) => !step.conclusive && !step.passed)).toBe(true);
        expect(result.throughputOnlyFailure).toBe(false);
        expect(result.interpretation).toContain('no conclusive application saturation');
    });
    it.each(['http_req_duration', 'endpoint_duration', 'endpoint_duration{stage:rps_75}'])(
        'mínimo negativo em %s invalida toda a evidência, sem alterar métricas brutas',
        (name) => {
            const metrics = completeMetrics();
            metrics[name].values.min = -2003.851429;
            const result = summarizeCapacity(metrics);
            expect(result.timingValidity.valid).toBe(false);
            expect(result.highestConsecutivePassingRps).toBe(0);
            expect(result.steps.every((step) => !step.conclusive && !step.passed)).toBe(true);
            expect(result.throughputOnlyFailure).toBe(false);
            expect(result.interpretation).toContain('Invalid or incomplete timing evidence');
            expect(metrics[name].values.min).toBe(-2003.851429);
        },
    );
    it.each([NaN, Infinity, -1])(
        'percentil inválido %s nunca produz faixa de capacidade',
        (value) => {
            const metrics = completeMetrics();
            metrics['endpoint_duration{stage:rps_200}'].values['p(99)'] = value;
            expect(summarizeCapacity(metrics).highestConsecutivePassingRps).toBe(0);
        },
    );
    it.each(['http_req_duration', 'endpoint_duration', 'invalid_timing'])(
        'métrica global ausente %s exige novo ensaio',
        (name) => {
            const metrics = completeMetrics();
            delete metrics[name];
            expect(summarizeCapacity(metrics).timingValidity.valid).toBe(false);
            expect(summarizeCapacity(metrics).highestConsecutivePassingRps).toBe(0);
        },
    );
    it('não admite marcador de amostra inválida mesmo após a Trend filtrá-la', () => {
        const metrics = completeMetrics();
        metrics.invalid_timing.values = { rate: 0.0001, passes: 1, fails: 9999 };
        const result = summarizeCapacity(metrics);
        expect(result.timingValidity.invalidSampleCount).toBe(1);
        expect(result.highestConsecutivePassingRps).toBe(0);
    });
    it('estatísticas de estágio ausentes e taxa de erro inválida são inconclusivas', () => {
        for (const error of [NaN, -1, 2]) {
            const metrics = completeMetrics();
            metrics['endpoint_errors{stage:rps_5}'].values.rate = error;
            const result = summarizeCapacity(metrics);
            expect(result.highestConsecutivePassingRps).toBe(2);
            expect(result.steps[1].conclusive).toBe(false);
        }
        const metrics = completeMetrics();
        delete metrics['endpoint_duration{stage:rps_5}'];
        const result = summarizeCapacity(metrics);
        expect(result.highestConsecutivePassingRps).toBe(2);
        expect(result.interpretation).toContain('Incomplete generator measurements');
    });
    it.each([Infinity, NaN, -1, 1.5])(
        'contagem de pedidos inválida %s não aprova o estágio',
        (count) => {
            const metrics = completeMetrics();
            metrics['endpoint_requests{stage:rps_5}'].values.count = count;
            expect(summarizeCapacity(metrics).steps[1].conclusive).toBe(false);
            expect(summarizeCapacity(metrics).highestConsecutivePassingRps).toBe(2);
        },
    );
    it('drops por estágio impedem aprovação e apontam limite do gerador', () => {
        const metrics = completeMetrics();
        metrics['dropped_iterations{stage:rps_20}'] = { values: { count: 1 } };
        const result = summarizeCapacity(metrics);
        expect(result.highestConsecutivePassingRps).toBe(10);
        expect(result.throughputOnlyFailure).toBe(true);
        metrics['dropped_iterations{stage:rps_20}'].values.count = NaN;
        expect(summarizeCapacity(metrics).steps[3].conclusive).toBe(false);
        metrics['dropped_iterations{stage:rps_20}'].values.count = -1;
        expect(summarizeCapacity(metrics).steps[3].conclusive).toBe(false);
        metrics['dropped_iterations{stage:rps_20}'].values.count = 0;
        expect(summarizeCapacity(metrics).steps[3].passed).toBe(true);
    });
});
