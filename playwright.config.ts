import { defineConfig, devices } from '@playwright/test';
import { assertIsolatedDatabase } from './tests/integration/guard';

assertIsolatedDatabase();
export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: 'http://localhost:3147',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    ],
    webServer: {
        command: 'node node_modules/next/dist/bin/next start --port 3147',
        url: 'http://localhost:3147/api/health/ready',
        reuseExistingServer: false,
        timeout: 90000,
        env: { ...(process.env as Record<string, string>), NODE_ENV: 'production' },
    },
});
