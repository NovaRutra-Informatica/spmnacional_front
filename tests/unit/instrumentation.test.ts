import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/config/runtime', () => ({ inspectRuntimeEnvironment: vi.fn() }));
vi.mock('../../lib/server/logger', () => ({ logError: vi.fn() }));

import { inspectRuntimeEnvironment } from '../../lib/config/runtime';
import { logError } from '../../lib/server/logger';
import { onRequestError, register } from '../../instrumentation';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('inicialização do servidor', () => {
    it('não exige segredos durante o build', async () => {
        vi.stubEnv('NEXT_RUNTIME', 'nodejs');
        vi.stubEnv('NEXT_PHASE', 'phase-production-build');
        await register();
        expect(inspectRuntimeEnvironment).not.toHaveBeenCalled();
    });

    it('não carrega a validação Node no runtime edge', async () => {
        vi.stubEnv('NEXT_RUNTIME', 'edge');
        await register();
        expect(inspectRuntimeEnvironment).not.toHaveBeenCalled();
    });

    it('permite iniciar produção com configuração válida', async () => {
        vi.stubEnv('NEXT_RUNTIME', 'nodejs');
        vi.stubEnv('NEXT_PHASE', undefined);
        vi.stubEnv('NODE_ENV', 'production');
        vi.mocked(inspectRuntimeEnvironment).mockReturnValue({ errors: [], warnings: [] });
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('encerramento inesperado');
        });
        await register();
        expect(exit).not.toHaveBeenCalled();
        expect(inspectRuntimeEnvironment).toHaveBeenCalledWith(process.env);
    });

    it('encerra com código 1 se a configuração de produção for inválida', async () => {
        vi.stubEnv('NEXT_RUNTIME', 'nodejs');
        vi.stubEnv('NEXT_PHASE', undefined);
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('AUTH_SECRET', 'valor-secreto-nao-pode-aparecer-no-log');
        vi.mocked(inspectRuntimeEnvironment).mockReturnValue({
            errors: ['APP_URL deve ser uma origem HTTPS válida.'],
            warnings: [],
        });
        const output = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('processo encerrado');
        });
        await expect(register()).rejects.toThrow('processo encerrado');
        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
        expect(JSON.parse(output.mock.calls[0][0])).toEqual({
            severity: 'CRITICAL',
            event: 'configuration.invalid',
            errors: ['APP_URL deve ser uma origem HTTPS válida.'],
        });
        expect(JSON.stringify(output.mock.calls)).not.toContain(process.env.AUTH_SECRET);
    });

    it('em desenvolvimento, rejeita a inicialização sem matar o processo', async () => {
        vi.stubEnv('NEXT_RUNTIME', 'nodejs');
        vi.stubEnv('NEXT_PHASE', undefined);
        vi.stubEnv('NODE_ENV', 'development');
        vi.mocked(inspectRuntimeEnvironment).mockReturnValue({
            errors: ['DATABASE_URL inválida.'],
            warnings: [],
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('encerramento inesperado');
        });
        await expect(register()).rejects.toThrow('DATABASE_URL inválida.');
        expect(exit).not.toHaveBeenCalled();
    });

    it('encaminha falhas de requisição apenas ao logger sanitizado', async () => {
        const error = new Error('conteúdo privado');
        await onRequestError(error);
        expect(logError).toHaveBeenCalledExactlyOnceWith('http.unhandled_error', error);
    });
});
