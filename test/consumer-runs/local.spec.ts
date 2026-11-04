import { expect, test } from '@playwright/test';
import type { ConsumerRun } from './consumer-run';
import { linkPathRepositoryPackage, runConsumer } from './consumer-run';
import { annotated, PROJECT_NAMES, receivedPaths, SAFETY_MESSAGE, testIn } from './facts';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('a run against the local environment', () => {
    let run: ConsumerRun;

    test.beforeAll(async () => {
        linkPathRepositoryPackage();
        run = await runConsumer({ variables: { E2E_ENV: 'local', E2E_SEARCH_SERVICE: 'on' } });
    });

    test('has a project per browser and suite, the packages grouped by where they are installed', () => {
        expect(run.report.errors).toEqual([]);
        expect(run.report.projects.map(project => project.name)).toEqual(PROJECT_NAMES);
    });

    test('runs only the tests tagged @mobile on the phone', () => {
        const onPhone = run.report.tests.filter(reported => reported.project.startsWith('mobile'));

        expect(onPhone.length).toBeGreaterThan(0);
        expect(onPhone.filter(reported => !reported.tags.includes('@mobile'))).toEqual([]);
    });

    test('never collects the tests of a disabled module', () => {
        expect(run.report.tests.filter(reported => reported.file.includes('Acme/Disabled'))).toEqual([]);
    });

    test('runs the tests of an enabled module, an installed package and a linked package', () => {
        expect(testIn(run.report, 'desktop-modules', 'an enabled module\'s test runs').status).toBe('expected');
        expect(testIn(run.report, 'desktop-packages-vendor', 'a Composer package\'s test runs').status).toBe('expected');
        expect(testIn(run.report, 'desktop-packages-packages', 'a linked Composer package\'s test runs').status)
            .toBe('expected');
    });

    test('runs a mutating test, and fails the tests without exactly one safety tag', () => {
        expect(testIn(run.report, 'desktop', 'a mutating test runs only where writes are allowed').status).toBe('expected');

        for (const title of ['a test without a safety tag is refused', 'a test with two safety tags is refused']) {
            const refused = testIn(run.report, 'desktop', title);

            expect(refused.status).toBe('unexpected');
            expect(refused.errors.join('\n')).toContain(SAFETY_MESSAGE);
        }
    });

    test('opens the stores with consent and page guards, and the environment E2E_ENV names', () => {
        const environment = testIn(run.report, 'desktop', 'the environment of the run is the one E2E_ENV names');

        expect(testIn(run.report, 'desktop', 'the default store opens with consent recorded and the page guards installed').status)
            .toBe('expected');
        expect(testIn(run.report, 'desktop', 'is the store the storefront opens').status).toBe('expected');
        expect(testIn(run.report, 'desktop', 'a search test runs only while the search service is on').status).toBe('expected');
        expect(environment.status).toBe('expected');
        expect(annotated(environment, 'environment')).toEqual(['local']);
    });

    test('lets service workers run and every write leave, as no store is the live shop', () => {
        const writes = testIn(run.report, 'desktop', 'writes leave the browser only where the run allows them');

        expect(writes.status).toBe('expected');
        expect(annotated(writes, 'serviceWorkers')).toEqual(['allow']);
        expect(receivedPaths(run.received)).toContain('/write-probe/own');
        expect(receivedPaths(run.received)).toContain('/write-probe/foreign');
    });

    test('never lets a blocked request reach the server', () => {
        expect(testIn(run.report, 'desktop', 'a blocked request never leaves the browser').status).toBe('expected');
        expect(receivedPaths(run.received).filter(received => received.startsWith('/blocked-beacon'))).toEqual([]);
    });
});

test.describe('a local run with the search service switched off', () => {
    test('skips the tests that need it, saying why', async () => {
        linkPathRepositoryPackage();

        const run = await runConsumer({
            variables: { E2E_ENV: 'local', E2E_SEARCH_SERVICE: 'off' },
            args: ['--project=desktop', '--grep=@search'],
        });
        const search = testIn(run.report, 'desktop', 'a search test runs only while the search service is on');

        expect(search.status).toBe('skipped');
        expect(annotated(search, 'skip')).toEqual(['the search service is switched off on local (E2E_SEARCH_SERVICE=off)']);
    });
});

test.describe('a local run with a store pointed at the live shop', () => {
    test('skips the mutating test, saying what it protects, and runs the read-only one', async () => {
        linkPathRepositoryPackage();

        const run = await runConsumer({
            variables: { E2E_ENV: 'local' },
            variablesOnPort: port => ({ E2E_BASE_URL_MAIN: `http://127.0.0.1:${String(port)}/` }),
            args: ['--project=desktop', '--grep=a mutating test runs|the default store opens'],
        });
        const mutating = testIn(run.report, 'desktop', 'a mutating test runs only where writes are allowed');
        const readonly = testIn(run.report, 'desktop', 'the default store opens with consent recorded and the page guards installed');

        expect(run.report.errors).toEqual([]);
        expect(mutating.status).toBe('skipped');
        expect(annotated(mutating, 'skip')).toEqual(['@mutating tests never run against the live shop']);
        expect(readonly.status).toBe('expected');
        expect(run.received.filter(request => request.path === '/').map(request => request.host))
            .toContain(`127.0.0.1:${String(run.port)}`);
    });
});
