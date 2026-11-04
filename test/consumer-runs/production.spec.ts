import { expect, test } from '@playwright/test';
import type { ConsumerRun } from './consumer-run';
import { linkPathRepositoryPackage, runConsumer } from './consumer-run';
import { annotated, PROJECT_NAMES, receivedPaths, SAFETY_MESSAGE, testIn } from './facts';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('a run against the production environment', () => {
    let run: ConsumerRun;

    test.beforeAll(async () => {
        linkPathRepositoryPackage();
        run = await runConsumer({ variables: { E2E_ENV: 'production', E2E_SEARCH_SERVICE: 'on' } });
    });

    test('has the same projects as any other run', () => {
        expect(run.report.errors).toEqual([]);
        expect(run.report.projects.map(project => project.name)).toEqual(PROJECT_NAMES);
    });

    test('skips the mutating test, saying why, and runs the read-only and cart tests', () => {
        const mutating = testIn(run.report, 'desktop', 'a mutating test runs only where writes are allowed');

        expect(mutating.status).toBe('skipped');
        expect(annotated(mutating, 'skip')).toEqual(['@mutating tests never run against production']);
        expect(testIn(run.report, 'desktop', 'the default store opens with consent recorded and the page guards installed').status)
            .toBe('expected');
        expect(testIn(run.report, 'desktop', 'is the store the storefront opens').status).toBe('expected');
        expect(annotated(testIn(run.report, 'desktop', 'the environment of the run is the one E2E_ENV names'), 'environment'))
            .toEqual(['production']);
    });

    test('fails the tests without exactly one safety tag', () => {
        for (const title of ['a test without a safety tag is refused', 'a test with two safety tags is refused']) {
            const refused = testIn(run.report, 'desktop', title);

            expect(refused.status).toBe('unexpected');
            expect(refused.errors.join('\n')).toContain(SAFETY_MESSAGE);
        }
    });

    test('runs the module and package tests, which only read', () => {
        expect(testIn(run.report, 'desktop-modules', 'an enabled module\'s test runs').status).toBe('expected');
        expect(testIn(run.report, 'desktop-packages-vendor', 'a Composer package\'s test runs').status).toBe('expected');
        expect(testIn(run.report, 'desktop-packages-packages', 'a linked Composer package\'s test runs').status)
            .toBe('expected');
    });

    test('blocks service workers and keeps every write on the shop', () => {
        const writes = testIn(run.report, 'desktop', 'writes leave the browser only where the run allows them');
        const paths = receivedPaths(run.received);

        expect(writes.status).toBe('expected');
        expect(annotated(writes, 'serviceWorkers')).toEqual(['block']);
        expect(annotated(writes, 'write')).toContain(`http://localhost:${String(run.port)}/write-probe/foreign refused`);
        expect(paths).toContain('/write-probe/own');
        expect(paths).not.toContain('/write-probe/foreign');
    });

    test('never lets a blocked request reach the server', () => {
        expect(testIn(run.report, 'desktop', 'a blocked request never leaves the browser').status).toBe('expected');
        expect(receivedPaths(run.received).filter(received => received.startsWith('/blocked-beacon'))).toEqual([]);
    });
});
