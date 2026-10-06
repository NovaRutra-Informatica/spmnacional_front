import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Run the network-free Bash fixtures alone, without starting an isolated database.
// They are also included by the regular integration suite in CI.
export default defineConfig({
    ...base,
    test: {
        ...base.test,
        include: ['tests/integration/deploy-workflow.test.ts'],
        exclude: [],
        setupFiles: [],
        fileParallelism: false,
        testTimeout: 30000,
        coverage: { enabled: false },
    },
});
