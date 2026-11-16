import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ConsumerRun, Received } from './consumer-run';
import { runConsumer } from './consumer-run';
import { annotated, testIn } from './facts';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const USER = 'consumer-admin';
const PASSWORD = 'consumer-admin-password-7f3a';

/** The run's admin user, and the same user as the page server's admin knows it. */
const ADMIN_USER = {
    E2E_ADMIN_USER: USER,
    E2E_ADMIN_PASSWORD: PASSWORD,
    E2E_CONSUMER_ADMIN_USER: USER,
    E2E_CONSUMER_ADMIN_PASSWORD: PASSWORD,
};

const OPENS = 'an admin test opens the dashboard and a menu item';
const SAME_SESSION = 'a second admin test of the worker opens the admin with the same session';
const READ_ONLY = 'a read-only test may not ask for the admin';
const DEFAULT_TRACE = 'an admin test that keeps the default trace never signs in';

function adminRequests(received: readonly Received[]): readonly Received[] {
    return received.filter(request => request.path.startsWith('/backoffice/'));
}

function signIns(received: readonly Received[]): readonly Received[] {
    return adminRequests(received).filter(request => request.method === 'POST');
}

test.describe('an @admin test', () => {
    test('signs in once per worker, opens the admin, and no step of the run names the user or the password', async () => {
        const stepsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'magento2-e2e-steps-')), 'steps.txt');

        try {
            const run = await runConsumer({
                variables: { E2E_ENV: 'local', E2E_CONSUMER_STEPS: stepsFile, ...ADMIN_USER },
                args: [
                    '--project=desktop',
                    '--workers=1',
                    '--reporter=json,./test/consumer-runs/step-titles.ts',
                    `--grep=${OPENS}|${SAME_SESSION}`,
                ],
            });
            const steps = fs.readFileSync(stepsFile, 'utf8');

            expect(run.report.errors).toEqual([]);
            expect(testIn(run.report, 'desktop', OPENS).errors).toEqual([]);
            expect(testIn(run.report, 'desktop', OPENS).status).toBe('expected');
            expect(testIn(run.report, 'desktop', SAME_SESSION).status).toBe('expected');
            expect(signIns(run.received)).toHaveLength(1);
            // The control that the reporter saw the sign-in's own call: Playwright titles an API step by its
            // method name in older versions ("page.evaluate") and by a phrase in newer ones ("Evaluate").
            expect(steps).toMatch(/^pw:api\t.*\bevaluate\b/imu);
            expect(steps).not.toContain(PASSWORD);
            expect(steps).not.toContain(USER);
            expect(run.reportText).not.toContain(PASSWORD);
            expect(run.reportText).not.toContain(USER);
        } finally {
            fs.rmSync(path.dirname(stepsFile), { recursive: true, force: true });
        }
    });

    test('is refused before anything reaches the admin when it keeps a trace, and so is a test without the tag', async () => {
        const run = await runConsumer({
            variables: { E2E_ENV: 'local', ...ADMIN_USER },
            args: ['--project=desktop', `--grep=${READ_ONLY}|${DEFAULT_TRACE}`],
        });

        expect(testIn(run.report, 'desktop', READ_ONLY).status).toBe('unexpected');
        expect(testIn(run.report, 'desktop', READ_ONLY).errors.join('\n'))
            .toContain(`The admin fixture is for tests tagged @admin; "${READ_ONLY}" is not.`);
        expect(testIn(run.report, 'desktop', DEFAULT_TRACE).status).toBe('unexpected');
        expect(testIn(run.report, 'desktop', DEFAULT_TRACE).errors.join('\n')).toContain(
            `A trace keeps the admin's sign-in and its session cookie, and "${DEFAULT_TRACE}" runs with trace retain-on-failure: `
            + 'add test.use({ trace: \'off\' }) to its file.',
        );
        expect(adminRequests(run.received)).toEqual([]);
    });

    test('is skipped without the run\'s admin user, saying why, and never reaches the admin', async () => {
        const run: ConsumerRun = await runConsumer({
            variables: { E2E_ENV: 'local' },
            args: ['--project=desktop', `--grep=${OPENS}`],
        });
        const opens = testIn(run.report, 'desktop', OPENS);

        expect(opens.status).toBe('skipped');
        expect(annotated(opens, 'skip')).toEqual(['@admin tests run only with E2E_ADMIN_USER and E2E_ADMIN_PASSWORD set']);
        expect(adminRequests(run.received)).toEqual([]);
    });

    test('is skipped on a run that reaches the live shop, and never reaches the admin', async () => {
        const run = await runConsumer({
            variables: { E2E_ENV: 'local', ...ADMIN_USER },
            variablesOnPort: port => ({ E2E_BASE_URL_MAIN: `http://127.0.0.1:${String(port)}/` }),
            args: ['--project=desktop', `--grep=${OPENS}`],
        });
        const opens = testIn(run.report, 'desktop', OPENS);

        expect(opens.status).toBe('skipped');
        expect(annotated(opens, 'skip')).toEqual(['@admin tests never run against the live shop']);
        expect(adminRequests(run.received)).toEqual([]);
    });
});
