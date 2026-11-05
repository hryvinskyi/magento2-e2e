import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { BrowserShopRequests } from '../../src/test-orders/browser-requests';
import { systemClock, TEST_ORDER_PROOF_HEADER, TestOrderProofs } from '../../src/test-orders/proof';
import { TestOrders } from '../../src/test-orders/shop';
import type { ShopRequestOptions } from '../../src/test-orders/shop';
import { PageServer } from './page-server';
import type { Served } from './page-server';

/**
 * The shop's REST calls from a page of the browser, in real Chromium against a local shop: what reached
 * the servers, what a failure says, and which page the proofs pass through.
 */

const QUIET_PAGE = '/robots.txt';
const ANSWERING = '/rest/fr/V1/test-orders/recognition';
const REDIRECTING = '/rest/fr/V1/test-orders/redirected';
const HANGING = '/rest/fr/V1/test-orders/hanging';
const GATED = '/rest/fr/V1/test-orders/gated';
const REFUSING = '/rest/fr/V1/test-orders/refusing';
const STORE_SCRIPT = '/store-script.js';
const NOISY_PAGE: Served = {
    status: 404,
    body: `<!doctype html><html><head><script src="${STORE_SCRIPT}"></script></head><body>not found</body></html>`,
    type: 'text/html',
};
const PLAIN_ROBOTS: Served = { body: 'User-agent: *\n', type: 'text/plain; charset=utf-8' };
const PROOF_VALUE = 'proof-that-stays-out-of-the-message';
const RECEIVED_PROOF_HEADER = TEST_ORDER_PROOF_HEADER.toLowerCase();

let shop: PageServer;
let elsewhere: PageServer;

test.beforeEach(async () => {
    elsewhere = await PageServer.start({});
    shop = await PageServer.start({
        [QUIET_PAGE]: PLAIN_ROBOTS,
        '/fr/robots.txt': NOISY_PAGE,
        [ANSWERING]: { body: 'true', type: 'application/json' },
        [REDIRECTING]: { status: 302, body: '', headers: { Location: elsewhere.url('/landed') } },
        [HANGING]: { body: 'true', delayMs: 60_000 },
        [GATED]: { body: 'true', type: 'application/json', browsersOnly: true },
        [REFUSING]: { status: 401, body: '{"message":"The test-order proof was refused."}', type: 'application/json' },
    });
});

test.afterEach(async () => {
    await shop.stop();
    await elsewhere.stop();
});

/** The options a request of the shop's client carries. */
function options(overrides: Partial<ShopRequestOptions> = {}): ShopRequestOptions {
    return { headers: { [TEST_ORDER_PROOF_HEADER]: PROOF_VALUE }, data: {}, timeout: 5_000, maxRedirects: 0, ...overrides };
}

/** The page of the context the requests are sent from. */
function quietPageOf(context: BrowserContext): Page {
    const [page] = context.pages().filter(open => open.url() === shop.url(QUIET_PAGE));

    if (page === undefined) {
        throw new Error('The context has no quiet page.');
    }

    return page;
}

/** What a promise is rejected with; fails when it is not. */
async function rejectionOf(attempt: Promise<unknown>): Promise<Error> {
    const outcome = await attempt.then(() => undefined, (error: unknown) => error);

    if (!(outcome instanceof Error)) {
        throw new Error('The request was expected to fail.');
    }

    return outcome;
}

/** Asserts that the error carries nothing of what was sent, in its message or in its stack. */
function expectNothingSentIn(error: Error): void {
    expect(`${error.message}\n${error.stack ?? ''}`).not.toContain(PROOF_VALUE);
    expect(error.cause).toBeUndefined();
}

test.describe('a REST call from the browser', () => {
    test('answers with the status and the body, and the shop reads JSON with the headers sent', async ({ context }) => {
        const requests = await BrowserShopRequests.open(context, shop.url('/'));
        const answer = await requests.post(shop.url(ANSWERING), options());

        expect(answer.status()).toBe(200);
        expect(await answer.text()).toBe('true');

        const [received, ...others] = shop.requestsTo(ANSWERING);

        expect(others).toEqual([]);
        expect(received?.method).toBe('POST');
        expect(received?.headers['content-type']).toBe('application/json');
        expect(received?.headers.accept).toBe('application/json');
        expect(received?.headers[RECEIVED_PROOF_HEADER]).toBe(PROOF_VALUE);
        expect(received?.body).toBe('{}');
    });

    test('carries the browser\'s session through a firewall that lets only browsers through', async ({ context }) => {
        await context.addCookies([{ name: 'session', value: 'firewall-session', url: shop.origin }]);

        const requests = await BrowserShopRequests.open(context, shop.url('/'));
        const answer = await requests.post(shop.url(GATED), options());

        expect(answer.status()).toBe(200);
        expect(shop.requestsTo(GATED).map(request => request.cookie)).toEqual(['session=firewall-session']);
    });

    test('hands the shop\'s refusal on as an answer', async ({ context }) => {
        const requests = await BrowserShopRequests.open(context, shop.url('/'));
        const answer = await requests.post(shop.url(REFUSING), options());

        expect(answer.status()).toBe(401);
        expect(await answer.text()).toContain('The test-order proof was refused.');
    });

    test('does not follow a redirect, and fails without the proof in the message', async ({ context }) => {
        const requests = await BrowserShopRequests.open(context, shop.url('/'));
        const failure = await rejectionOf(requests.post(shop.url(REDIRECTING), options()));

        expect(failure.message).toContain('the redirect was not followed');
        expectNothingSentIn(failure);
        expect(elsewhere.received).toEqual([]);
    });

    test('fails at the deadline when the server never answers, without the proof in the message', async ({ context }) => {
        const requests = await BrowserShopRequests.open(context, shop.url('/'));
        const failure = await rejectionOf(requests.post(shop.url(HANGING), options({ timeout: 200 })));

        expect(failure.message).toContain('TimeoutError');
        expectNothingSentIn(failure);
        expect(shop.requestsTo(HANGING).map(request => request.headers[RECEIVED_PROOF_HEADER])).toEqual([PROOF_VALUE]);
    });

    test('fails without the proof in the message once the page is gone', async ({ context }) => {
        const requests = await BrowserShopRequests.open(context, shop.url('/'));

        await requests.close();

        expectNothingSentIn(await rejectionOf(requests.post(shop.url(ANSWERING), options())));
        expect(shop.requestsTo(ANSWERING)).toEqual([]);
    });

    test('serves the shop\'s client: recognition and abandoning through the browser', async ({ context }) => {
        const proofs = new TestOrderProofs('browser-spec-secret-0123456789abcdef-long', systemClock);
        const requests = await BrowserShopRequests.open(context, shop.url('/'));
        const client = new TestOrders(requests, shop.url('/rest/fr/V1/'), proofs);

        expect(await client.recognition()).toEqual({ recognised: true });
        expect(shop.requestsTo(ANSWERING).map(request => request.headers[RECEIVED_PROOF_HEADER]))
            .toEqual([expect.stringMatching(/^\d{10}\.[0-9a-f]{64}$/)]);
    });
});

test.describe('the page the calls come from', () => {
    test('is at the root of the store\'s origin for a store below a path, and has no script of the storefront\'s page', async ({ context }) => {
        const requests = await BrowserShopRequests.open(context, shop.url('/fr/'));

        await requests.post(shop.url(ANSWERING), options());

        expect(await quietPageOf(context).evaluate(() => document.scripts.length)).toBe(0);
        expect(shop.requestsTo(QUIET_PAGE).map(request => request.method)).toEqual(['GET']);
        expect(shop.requestsTo('/fr/robots.txt')).toEqual([]);
        expect(shop.requestsTo(STORE_SCRIPT)).toEqual([]);
    });

    const NOT_QUIET: readonly { readonly name: string; readonly served: Served; readonly reason: string }[] = [
        { name: 'a 404 page', served: { ...NOISY_PAGE, status: 404 }, reason: '404 text/html' },
        { name: 'an HTML page with a 200', served: { ...NOISY_PAGE, status: 200 }, reason: '200 text/html' },
        { name: 'plain text with another status', served: { status: 403, body: 'no', type: 'text/plain' }, reason: '403 text/plain' },
    ];

    for (const { name, served, reason } of NOT_QUIET) {
        test(`is refused when the address answers ${name}, before any proof is sent`, async ({ context }) => {
            const noisy = await PageServer.start({ [QUIET_PAGE]: served, [ANSWERING]: { body: 'true' } });
            const failure = await rejectionOf(BrowserShopRequests.open(context, noisy.url('/')));

            expect(failure.message).toContain(`answered ${reason}`);
            expect(failure.message).toContain('No proof was sent.');
            expect(noisy.requestsTo(ANSWERING)).toEqual([]);
            expect(context.pages()).toEqual([]);
            await noisy.stop();
        });
    }

    test('is refused when the address sends the browser to another origin', async ({ context }) => {
        const leaving = await PageServer.start({ [QUIET_PAGE]: { status: 302, body: '', headers: { Location: `${shop.origin}${QUIET_PAGE}` } } });
        const failure = await rejectionOf(BrowserShopRequests.open(context, leaving.url('/')));

        expect(failure.message).toContain(`an answer from ${shop.url(QUIET_PAGE)}`);
        expect(context.pages()).toEqual([]);
        await leaving.stop();
    });

    test('is closed by close()', async ({ context }) => {
        const requests = await BrowserShopRequests.open(context, shop.url('/'));
        const page = quietPageOf(context);

        await requests.close();

        expect(page.isClosed()).toBe(true);
    });
});
