import { defineConfig, devices } from '@playwright/test';

/**
 * The package's own suite. The `unit` project runs plain Node specs: it never opens a browser. The
 * `browser` project drives Chromium against pages its specs serve from 127.0.0.1. The `consumer`
 * project runs the consumer project in `consumer/` with Playwright in child processes, loading the
 * package from `src/` through the consumer's `tsconfig` paths, and asserts on their reports.
 */
export default defineConfig({
    forbidOnly: process.env.CI !== undefined && process.env.CI !== '',
    reporter: 'list',
    projects: [
        {
            name: 'unit',
            testDir: './unit',
        },
        {
            name: 'browser',
            testDir: './browser',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'consumer',
            testDir: './consumer-runs',
        },
    ],
});
