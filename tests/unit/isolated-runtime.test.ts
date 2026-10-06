import { describe, expect, it } from 'vitest';
import { assertIsolatedOwner } from '../../scripts/lib/isolated-runtime.mjs';

const runId = 'spm-test-0123456789abcdef';
describe('provisionamento E2E limitado ao owner descartável', () => {
    it('aceita somente loopback/porta/base/owner e execução descartáveis', () => {
        expect(assertIsolatedOwner('postgresql://spm_test:synthetic@127.0.0.1:54321/spm_test', runId).username).toBe('spm_test');
    });
    it.each([
        'postgresql://spm_test:synthetic@cloud.example.test:5432/spm_test',
        'postgresql://spm_test:synthetic@127.0.0.1:5432/production',
        'postgresql://spm_e2e_app:synthetic@127.0.0.1:5432/spm_test',
        'postgresql://spm_test:synthetic@127.0.0.1/spm_test',
        'postgresql://spm_test:synthetic@127.0.0.1:5432/spm_test?host=cloud.example.test',
        'http://spm_test:synthetic@127.0.0.1:5432/spm_test',
    ])('recusa target não autorizado antes de conexão: %s', url => {
        expect(() => assertIsolatedOwner(url, runId)).toThrow('disposable loopback');
    });
    it('não aceita autorização implícita por nome de base', () => {
        expect(() => assertIsolatedOwner('postgresql://spm_test:synthetic@127.0.0.1:5432/spm_test', 'manual')).toThrow();
    });
});
