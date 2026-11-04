import { expect, test } from '@playwright/test';
import { ClickReports } from '../../src/click-reports';
import { evidence } from '../../src/evidence';
import { tabToNextControl } from '../../src/keyboard';
import { pageModule } from '../../src/page-modules';
import { RequestsInFlight } from '../../src/requests-in-flight';
import { blockRequests } from '../../src/storefront/blocked-requests';
import { PageServer } from './page-server';

const HTML = 'text/html';

/** A page with a RequireJS stand-in that knows one module, `known/module`, and fails every other. */
const WITH_LOADER = `<!doctype html>
<html><body><p id="box">box</p><script>
window.requirejs = function (names, onLoad, onError) {
    if (names[0] === 'known/module') {
        onLoad({ answer: 42 });
    } else {
        onError(new Error('Script error for "' + names[0] + '"'));
    }
};
</script></body></html>`;

const CONTROLS = '<!doctype html><html><body><button id="first">First</button><button id="second">Second</button></body></html>';

let server: PageServer;

test.beforeAll(async () => {
    server = await PageServer.start({
        '/': { body: '<!doctype html><html><body><p id="box">box</p></body></html>', type: HTML },
        '/with-loader': { body: WITH_LOADER, type: HTML },
        '/controls': { body: CONTROLS, type: HTML },
        '/slow-answer': { body: 'late', delayMs: 500 },
    });
});

test.afterAll(async () => {
    await server.stop();
});

test.describe('requests in flight', () => {
    test('are settled once every watched request was answered', async ({ page }) => {
        await page.goto(server.url('/'));
        const inFlight = RequestsInFlight.watch(page, [/\/slow-answer$/], 'the slow answer');
        const started = Date.now();

        // The page reads the answer, as a page does: a response nobody reads is never reported as finished.
        await page.evaluate(target => { void fetch(target).then(response => response.text()); }, server.url('/slow-answer'));
        await expect.poll(() => server.requestsTo('/slow-answer').length).toBeGreaterThan(0);
        await inFlight.settled();

        expect(Date.now() - started).toBeGreaterThanOrEqual(400);
    });

    test('are settled at once when nothing watched was sent', async ({ page }) => {
        await page.goto(server.url('/'));

        await RequestsInFlight.watch(page, [/\/never$/], 'nothing').settled();
    });
});

test.describe('click reports', () => {
    test('are stopped before they leave and counted, ahead of a block on the context', async ({ page, context }) => {
        await blockRequests(context, [/\/collect\?/]);
        const reports = await ClickReports.stop(page, /\/collect\?/, request => request.url().includes('event=click'));

        await page.goto(server.url('/'));
        await page.evaluate(base => {
            navigator.sendBeacon(`${base}/collect?event=view`);
            navigator.sendBeacon(`${base}/collect?event=click`);
        }, server.origin);

        await expect.poll(() => reports.count).toBe(1);
        expect(server.received.filter(request => request.path.startsWith('/collect'))).toEqual([]);
    });
});

test.describe('a page module', () => {
    test('is loaded through the page\'s own RequireJS and stays in the page', async ({ page }) => {
        await page.goto(server.url('/with-loader'));

        const module = await pageModule(page, 'known/module');

        expect(await module.evaluate(value => (typeof value === 'object' && value !== null && 'answer' in value
            ? value.answer
            : undefined))).toBe(42);
    });

    test('that cannot be loaded rejects', async ({ page }) => {
        await page.goto(server.url('/with-loader'));

        await expect(pageModule(page, 'missing/module')).rejects.toThrow('Script error for "missing/module"');
    });

    test('rejects on a page without RequireJS', async ({ page }) => {
        await page.goto(server.url('/'));

        await expect(pageModule(page, 'known/module')).rejects.toThrow('The page has no RequireJS to load known/module with.');
    });
});

test('tabbing moves focus to the next control', async ({ page }) => {
    await page.goto(server.url('/controls'));
    await page.locator('#first').focus();

    await tabToNextControl(page);

    await expect(page.locator('#second')).toBeFocused();
});

test.describe('evidence', () => {
    const original = process.env.E2E_EVIDENCE;

    test.afterEach(() => {
        if (original === undefined) {
            delete process.env.E2E_EVIDENCE;
        } else {
            process.env.E2E_EVIDENCE = original;
        }
    });

    test('is attached as a named screenshot in a run that keeps evidence', async ({ page }, testInfo) => {
        process.env.E2E_EVIDENCE = '1';
        await page.goto(server.url('/'));

        await evidence('The box', page.locator('#box'));

        expect(testInfo.attachments.map(attachment => [attachment.name, attachment.contentType]))
            .toEqual([['The box', 'image/png']]);
    });

    test('is not taken in a run that keeps none', async ({ page }, testInfo) => {
        delete process.env.E2E_EVIDENCE;
        await page.goto(server.url('/'));

        await evidence('The box', page);

        expect(testInfo.attachments).toHaveLength(0);
    });
});
