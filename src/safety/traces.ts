import type { PlaywrightWorkerOptions } from '@playwright/test';

/**
 * Refuses a test that records a trace, whatever the mode, before it does what the trace would keep: a
 * trace keeps every request header and cookie of the test. `keeps` says what that would be (*a trace
 * keeps every proof of a test order*), and the test is named by its `title`. Playwright's `trace` option
 * names its mode directly or in an object.
 */
export function refuseTrace(trace: PlaywrightWorkerOptions['trace'], title: string, keeps: string): void {
    const mode = typeof trace === 'string' ? trace : trace.mode;

    if (mode !== 'off') {
        throw new Error(`${keeps}, and "${title}" runs with trace ${mode}: add test.use({ trace: 'off' }) to its file.`);
    }
}
