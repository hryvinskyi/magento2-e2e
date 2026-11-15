import { expect, test } from '@playwright/test';
import { refuseTrace } from '../../src/safety/traces';

const KEEPS = 'A trace keeps the session cookie';

test('a test with its trace off passes, whichever way the mode is written', () => {
    expect(() => { refuseTrace('off', 'a test', KEEPS); }).not.toThrow();
    expect(() => { refuseTrace({ mode: 'off' }, 'a test', KEEPS); }).not.toThrow();
});

test('a test with any other mode is refused, saying what the trace would keep and how to switch it off', () => {
    for (const trace of ['on', 'retain-on-failure', { mode: 'on-first-retry' }] as const) {
        expect(() => { refuseTrace(trace, 'a test', KEEPS); }, JSON.stringify(trace)).toThrow(
            `A trace keeps the session cookie, and "a test" runs with trace ${typeof trace === 'string' ? trace : trace.mode}: add test.use({ trace: 'off' }) to its file.`,
        );
    }
});
