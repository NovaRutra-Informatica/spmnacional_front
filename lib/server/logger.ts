import 'server-only';

type LogFields = Record<string, string | number | boolean | null>;
const allowedFields = new Set([
    'requestId',
    'durationMs',
    'status',
    'count',
    'attempt',
    'operation',
]);

/** Não serializa Error, SQL, cabeçalhos, tokens, mensagens de contato ou URLs. */
export function logError(event: string, error: unknown, fields: LogFields = {}): void {
    const code =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^(?:P\d{4}|E[A-Z_]{2,30}|[0-9A-Z]{5})$/.test(error.code)
            ? error.code
            : undefined;
    const safeFields = Object.fromEntries(
        Object.entries(fields).filter(
            ([key, value]) =>
                allowedFields.has(key) &&
                (typeof value !== 'string' || /^[a-zA-Z0-9_.:-]{1,100}$/.test(value)),
        ),
    );
    console.error(
        JSON.stringify({
            severity: 'ERROR',
            event: /^[a-zA-Z0-9_.:-]{1,80}$/.test(event) ? event : 'application.error',
            ...(code ? { code } : {}),
            ...safeFields,
        }),
    );
}
