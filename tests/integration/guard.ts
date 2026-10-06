// Recusa até importação do cliente em testes de integração apontados a uma base não isolada.
export function assertIsolatedDatabase() {
    const url = new URL(process.env.DATABASE_URL || 'http://invalid');
    const role = process.env.SPM_ISOLATED_TEST_DATABASE_ROLE || 'spm_test';
    if (
        !/^spm-test-[a-f0-9]{16}$/.test(process.env.SPM_ISOLATED_TEST_RUN || '') ||
        !['postgres:', 'postgresql:'].includes(url.protocol) || url.search !== '' ||
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/spm_test' ||
        !['spm_test', 'spm_e2e_app'].includes(role) ||
        url.username !== role
    ) {
        throw new Error(
            'Testes exigem banco descartável criado por npm run test:integration/test:e2e.',
        );
    }
}
assertIsolatedDatabase();
