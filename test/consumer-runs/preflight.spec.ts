import { expect, test } from '@playwright/test';
import { linkPathRepositoryPackage, runConsumer } from './consumer-run';
import { testIn } from './facts';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('the storefront check before a run', () => {
    test.beforeAll(() => {
        linkPathRepositoryPackage();
    });

    test('stops the whole run, saying why, when the default store does not answer 200', async () => {
        const run = await runConsumer({ variables: { E2E_ENV: 'local', E2E_CONSUMER_HOME_STATUS: '503' } });

        expect(run.exitCode).toBe(1);
        expect(run.report.errors).toEqual([
            `Error: The local storefront is not answering: http://localhost:${String(run.port)}/ gave 503 3 times `
            + 'over 20 seconds. No check was run.',
        ]);
        expect(run.report.tests.filter(reported => reported.status !== 'skipped')).toEqual([]);
        expect(run.received.filter(request => request.path === '/')).toHaveLength(3);
    });

    test('asks as the browser the tests use, for the document alone', async () => {
        const run = await runConsumer({
            variables: { E2E_ENV: 'local' },
            args: ['--project=desktop', '--grep=E2E_ENV names'],
        });

        expect(run.report.errors).toEqual([]);
        expect(run.received.map(request => request.path)).toEqual(['/']);
        expect(run.received[0]?.accept).toContain('text/html');
    });

    test('is skipped for one run with E2E_PREFLIGHT=off', async () => {
        const run = await runConsumer({
            variables: { E2E_ENV: 'local', E2E_CONSUMER_HOME_STATUS: '503', E2E_PREFLIGHT: 'off' },
            args: ['--project=desktop', '--grep=E2E_ENV names'],
        });

        expect(run.report.errors).toEqual([]);
        expect(testIn(run.report, 'desktop', 'the environment of the run is the one E2E_ENV names').status).toBe('expected');
        expect(run.received).toEqual([]);
    });
});
