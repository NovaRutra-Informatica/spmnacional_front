const RESPONSE_TIMINGS = Object.freeze([
    'duration',
    'blocked',
    'connecting',
    'tls_handshaking',
    'sending',
    'waiting',
    'receiving',
]);
const REQUIRED_STATS = Object.freeze(['min', 'p(95)', 'p(99)']);

export function validDurationValues(values) {
    return Boolean(
        values &&
        REQUIRED_STATS.every((stat) => Number.isFinite(values[stat]) && values[stat] >= 0) &&
        Object.values(values).every((value) => Number.isFinite(value) && value >= 0),
    );
}

// Invalid samples stay in k6's original HTTP metrics. The custom Trend excludes
// them only after recording an explicit failing metric; they never earn a pass.
export function recordTiming(timings, tags, durationMetric, invalidTimingMetric) {
    const valid = RESPONSE_TIMINGS.every(
        (field) => Number.isFinite(timings?.[field]) && timings[field] >= 0,
    );
    invalidTimingMetric.add(!valid, tags);
    if (valid) durationMetric.add(timings.duration, tags);
    return valid;
}

export function summarizeTimingValidity(metrics) {
    const reasons = [];
    for (const name of ['http_req_duration', 'endpoint_duration']) {
        if (!validDurationValues(metrics[name]?.values)) reasons.push(`invalid_or_missing:${name}`);
    }
    // Preserve/validate every supplied temporal aggregate, including connection
    // phases and tagged endpoint/stage Trends. A good p95 cannot hide a bad min.
    for (const [name, metric] of Object.entries(metrics)) {
        if (
            /^(?:http_req_(?:duration|blocked|connecting|tls_handshaking|sending|waiting|receiving)|endpoint_duration)(?:\{|$)/.test(
                name,
            ) &&
            metric.values &&
            Object.values(metric.values).some((value) => !Number.isFinite(value) || value < 0)
        )
            reasons.push(`invalid_temporal_value:${name}`);
    }
    const invalid = metrics.invalid_timing?.values;
    const count = invalid?.passes + invalid?.fails;
    const observed =
        Number.isFinite(invalid?.rate) &&
        invalid.rate >= 0 &&
        invalid.rate <= 1 &&
        Number.isFinite(invalid?.passes) &&
        invalid.passes >= 0 &&
        Number.isFinite(invalid?.fails) &&
        invalid.fails >= 0 &&
        count > 0;
    if (!observed) reasons.push('missing_or_invalid:invalid_timing');
    else if (invalid.rate !== 0 || invalid.passes !== 0) reasons.push('invalid_response_timing');
    return {
        valid: reasons.length === 0,
        reasons,
        invalidSampleRate: observed ? invalid.rate : null,
        invalidSampleCount: observed ? invalid.passes : null,
        observedSampleCount: observed ? count : null,
    };
}
