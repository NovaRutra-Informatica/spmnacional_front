import { summarizeTimingValidity, validDurationValues } from './timing-validity.js';

/** Fixed isolated capacity experiment. No environment/CLI override can raise its cap. */
export const CAPACITY_RATES = Object.freeze([2, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200]);
// At the 200 req/s cap, 200 slots support a 1s average response time. Keep
// this fixed; CPU/memory remain bounded separately by the isolated harness.
export const CAPACITY_MAX_VUS = 200;
export const CAPACITY_STEPS = Object.freeze(
    CAPACITY_RATES.map((rate, index) => ({
        key: `rps_${rate}`,
        rate,
        startSeconds: index === 0 ? 0 : index * 31 - 1,
        endSeconds: (index + 1) * 31 - 1,
    })),
);
export function capacityStep(elapsedMs) {
    return (
        CAPACITY_STEPS.find(
            (step) => elapsedMs >= step.startSeconds * 1000 && elapsedMs < step.endSeconds * 1000,
        )?.key ?? 'complete'
    );
}
export function summarizeCapacity(metrics) {
    const timingValidity = summarizeTimingValidity(metrics);
    const steps = CAPACITY_STEPS.map((step) => {
        const selector = `{stage:${step.key}}`;
        const requests = metrics[`endpoint_requests${selector}`]?.values?.count ?? 0;
        const duration = metrics[`endpoint_duration${selector}`]?.values;
        const errorRate = metrics[`endpoint_errors${selector}`]?.values?.rate;
        const dropped = metrics[`dropped_iterations${selector}`]?.values?.count;
        const achievedRps = requests / (step.endSeconds - step.startSeconds);
        const conclusive =
            timingValidity.valid &&
            Number.isSafeInteger(requests) &&
            requests > 0 &&
            validDurationValues(duration) &&
            Number.isFinite(errorRate) &&
            errorRate >= 0 &&
            errorRate <= 1 &&
            (dropped === undefined || (Number.isSafeInteger(dropped) && dropped >= 0));
        return {
            ...step,
            requests,
            achievedRps,
            p95Ms: duration?.['p(95)'] ?? null,
            p99Ms: duration?.['p(99)'] ?? null,
            errorRate: errorRate ?? null,
            droppedIterations: dropped ?? null,
            conclusive,
            passed:
                conclusive &&
                duration['p(95)'] < 1000 &&
                duration['p(99)'] < 2000 &&
                errorRate < 0.01 &&
                (dropped === undefined || dropped === 0) &&
                achievedRps >= step.rate * 0.95,
        };
    });
    const firstFailure = steps.find((step) => !step.passed);
    const preceding = firstFailure ? steps.slice(0, steps.indexOf(firstFailure)) : steps;
    const throughputOnlyFailure = Boolean(
        firstFailure?.conclusive &&
        firstFailure.p95Ms < 1000 &&
        firstFailure.p99Ms < 2000 &&
        firstFailure.errorRate < 0.01 &&
        (firstFailure.achievedRps < firstFailure.rate * 0.95 || firstFailure.droppedIterations > 0),
    );
    return {
        timingValidity,
        steps,
        highestConsecutivePassingRps: preceding[preceding.length - 1]?.rate ?? 0,
        firstNonPassingRps: firstFailure?.rate ?? null,
        testedCapRps: CAPACITY_RATES[CAPACITY_RATES.length - 1],
        throughputOnlyFailure,
        interpretation: !timingValidity.valid
            ? 'Invalid or incomplete timing evidence; no conclusive application saturation point or capacity bound. Inspect raw timing metrics and repeat the experiment.'
            : !firstFailure
              ? 'All bounded stages passed: measured lower bound, not the maximum capacity.'
              : !firstFailure.conclusive
                ? 'Incomplete generator measurements; no conclusive application saturation point.'
                : throughputOnlyFailure
                  ? 'Offered rate was not sustained while completed requests met the latency/error SLO. Check generator CPU, memory and VU limits before inferring application saturation.'
                  : 'Local SLO saturation bracket; not a universal production capacity.',
    };
}
