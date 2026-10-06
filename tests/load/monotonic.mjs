import { writeFileSync } from 'node:fs';
import { CAPACITY_STEPS, summarizeCapacity } from './capacity-plan.js';
import { summarizeTimingValidity } from './timing-validity.js';
import {
    accountingValid,
    makeMetrics,
    PUBLIC_ENDPOINTS,
    requestEndpoint,
    runArrivalPlan,
    validateMonotonicConfig,
    MAX_IN_FLIGHT,
    REQUEST_TIMEOUT_MS,
    MAX_BODY_BYTES,
} from './monotonic-core.mjs';

if (process.argv.length !== 2) throw new Error('Monotonic experiment has no CLI overrides.');
const config = validateMonotonicConfig(process.env);
const result = await runArrivalPlan({
    stages: CAPACITY_STEPS,
    request: (endpoint) => requestEndpoint(endpoint, config.encoding),
});
const metrics = makeMetrics(result, CAPACITY_STEPS);
const timingValidity = summarizeTimingValidity(metrics);
const capacity = summarizeCapacity(metrics);
const validAccounting = accountingValid(result);
const passed =
    timingValidity.valid &&
    validAccounting &&
    metrics.dropped_iterations.values.count === 0 &&
    capacity.steps.every((step) => step.passed);
if (!validAccounting) {
    capacity.highestConsecutivePassingRps = 0;
    capacity.interpretation =
        'Incomplete or inconsistent monotonic generator accounting; no conclusive capacity bound.';
}
const summary = {
    metrics,
    loadTest: {
        schemaVersion: 1,
        run: config.run,
        profile: 'capacity',
        engine: 'node-monotonic',
        generatedAt: new Date().toISOString(),
        capacity,
        timingValidity,
        accountingValid: validAccounting,
        stageAccounting: result.stageCounts,
        peakInFlight: result.peakInFlight,
        elapsedMs: result.elapsedMs,
        target: 'http://spm-load-app:3000',
        acceptEncoding: config.encoding,
        limits: {
            maxInFlight: MAX_IN_FLIGHT,
            requestTimeoutMs: REQUEST_TIMEOUT_MS,
            responseBodyBytes: MAX_BODY_BYTES,
            p95Ms: 1000,
            p99Ms: 2000,
            errorRateExclusive: 0.01,
            droppedIterations: 0,
        },
        plan: CAPACITY_STEPS,
        oneRequestPerIteration: true,
        endpoints: Object.fromEntries(
            PUBLIC_ENDPOINTS.map((endpoint) => [
                endpoint.key,
                {
                    path: endpoint.path,
                    requests: metrics[`endpoint_requests{endpoint:${endpoint.key}}`].values,
                    durationMs: metrics[`endpoint_duration{endpoint:${endpoint.key}}`].values,
                    errors: metrics[`endpoint_errors{endpoint:${endpoint.key}}`].values,
                },
            ]),
        ),
        limitations: [
            'Local isolated Docker experiment, not GCP capacity or browser Web Vitals.',
            'Monotonic performance.now RTT includes connection setup and the complete compressed body; differs from k6 http_req_duration phase definition.',
            'Fixed constant arrival rate in each 30/31-second stage; no interpolation ramp or warm-up exclusion.',
            'Only six allowlisted public routes; no OAuth, SMTP, Calendar, GCS or external requests.',
            'Body decoding and sentinel checks are bounded and transient; no response body, cookie or credential is persisted.',
            'Generator is limited to 2 CPU, 512 MiB and 200 in-flight requests; dropped offered load does not prove application capacity by itself.',
        ],
        passed,
    },
};
writeFileSync(
    '/results/capacity-points.json',
    result.points.map((point) => JSON.stringify(point)).join('\n') + '\n',
);
writeFileSync('/results/capacity.json', JSON.stringify(summary, null, 2));
console.log(
    `[SPM capacity node-monotonic] ${passed ? 'PASSED' : timingValidity.valid && validAccounting ? 'FAILED SLO' : 'INVALID EVIDENCE'}: ${result.points.length} requests; dropped=${metrics.dropped_iterations.values.count}; highest consecutive passing=${capacity.highestConsecutivePassingRps} req/s.`,
);
process.exitCode = passed ? 0 : 99;
