import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertIsolatedLoadDatabase } from '../load/guard';

const DATABASE_URL = 'postgresql://spm_load:synthetic-only@127.0.0.1:49152/spm_load';
const RUN = 'spm-load-0123456789abcdef';

describe('isolamento obrigatório da base de carga', () => {
    beforeEach(() => {
        vi.stubEnv('SPM_LOAD_RUN', RUN);
        vi.stubEnv('DATABASE_URL', DATABASE_URL);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('aceita somente o formato do banco descartável em loopback com porta explícita', () => {
        expect(() => assertIsolatedLoadDatabase()).not.toThrow();
    });

    it.each([
        ['URL ausente', ''],
        ['URL inválida', 'not-a-url'],
        ['protocolo não PostgreSQL', DATABASE_URL.replace('postgresql:', 'https:')],
        ['hostname ambíguo', DATABASE_URL.replace('127.0.0.1', 'localhost')],
        ['servidor remoto', DATABASE_URL.replace('127.0.0.1', '192.0.2.1')],
        ['porta privilegiada', DATABASE_URL.replace('49152', '443')],
        ['porta implícita', DATABASE_URL.replace(':49152', '')],
        ['outro usuário', DATABASE_URL.replace('spm_load:synthetic-only', 'other:synthetic-only')],
        ['senha ausente', DATABASE_URL.replace('synthetic-only', '')],
        ['outro banco', DATABASE_URL.replace('/spm_load', '/production')],
        ['override de host pela query', `${DATABASE_URL}?host=192.0.2.1`],
        ['fragmento não permitido', `${DATABASE_URL}#override`],
    ])('recusa %s antes de importar ou consultar o banco', (_description, url) => {
        vi.stubEnv('DATABASE_URL', url);
        expect(() => assertIsolatedLoadDatabase()).toThrow(
            'Carga exige banco descartável criado pelo executor isolado.',
        );
    });

    it('recusa identificador de execução que não pertence ao formato isolado', () => {
        vi.stubEnv('SPM_LOAD_RUN', 'spm-load-invalid');
        expect(() => assertIsolatedLoadDatabase()).toThrow(
            'Carga exige banco descartável criado pelo executor isolado.',
        );
    });
});
