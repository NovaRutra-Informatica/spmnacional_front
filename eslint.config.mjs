import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([
        '.next/**',
        '.pages-build/**',
        'out/**',
        'output/**',
        'tmp/**',
        'storage/**',
        'lib/generated/**',
        'legacy-angular/**',
        'coverage/**',
        'playwright-report/**',
        'test-results/**',
        'scripts/pages-overrides/**',
        'infra/**',
    ]),
    // Incremental adoption: compiler optimization suggestions don't block legacy UI.
    {
        rules: {
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/purity': 'warn',
        },
    },
]);
