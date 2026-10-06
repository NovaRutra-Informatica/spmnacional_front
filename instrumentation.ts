export async function register() {
    // O artefato é construído sem segredos. A validação ocorre ao iniciar o servidor.
    if (
        process.env.NEXT_RUNTIME === 'nodejs' &&
        process.env.NEXT_PHASE !== 'phase-production-build'
    ) {
        const { inspectRuntimeEnvironment } = await import('./lib/config/runtime');
        const report = inspectRuntimeEnvironment(process.env);
        if (report.errors.length) {
            // São mensagens fixas do validador, nunca valores de segredos.
            console.error(
                JSON.stringify({
                    severity: 'CRITICAL',
                    event: 'configuration.invalid',
                    errors: report.errors,
                }),
            );
            // Next pode capturar a rejeição de register e deixar a porta TCP aberta.
            // Em produção, configuração inválida precisa encerrar o processo.
            if (process.env.NODE_ENV === 'production') process.exit(1);
            throw new Error(`Configuração inválida: ${report.errors.join(' ')}`);
        }
    }
}

export async function onRequestError(error: unknown) {
    const { logError } = await import('./lib/server/logger');
    logError('http.unhandled_error', error);
}
