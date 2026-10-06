import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
    ...base,
    test: {
        ...base.test,
        include: ['tests/integration/**/*.test.ts'],
        exclude: [],
        setupFiles: ['tests/integration/guard.ts'],
        fileParallelism: false,
        testTimeout: 30000,
        hookTimeout: 30000,
        coverage: { enabled: false },
    },
});
