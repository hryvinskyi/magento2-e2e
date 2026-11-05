import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GUEST_PAYMENT_INFORMATION, signTestOrderPlacements, stopUnsignedPlacements } from '../../src/test-orders/placement';
import type { PlacedTestOrder, PlacementRoute, PlacementSigner, SignedPlacements, TestOrderPlacementTerms } from '../../src/test-orders/placement';
import { PLACEMENT_SENDERS } from '../../src/test-orders/placement-clients';
import type { PlacementAttempt } from '../../src/test-orders/placement-clients';
import { systemClock, TEST_ORDER_PROOF_HEADER, TestOrderProofs } from '../../src/test-orders/proof';
import { finishTestOrderRun } from '../../src/test-orders/run';
import { TestOrderCarts } from '../../src/test-orders/carts';
import { SHOP_CLIENTS, TestOrders } from '../../src/test-orders/shop';
import { ACME_CHECKOUT, ACME_PLACEMENT } from '../unit/acme-checkout-route';
import { PageServer } from './page-server';
import type { Received } from './page-server';

/**
 * The placement route in real Chromium against a local shop: what the checkout's requests turn into,
 * judged by what the servers received.
 */

const CART = 'Mg4w0eZ3k1qYbVt9XcLpR2sNd8HuJf6A';
const OTHER_CART = 'Zq8L1pW4nB7vC2xK9mT5rY3sD6fG0hJa';
const REFUSED_CART = 'Hb5T2nQ9xW7kM3vR8cJ1yL6pD4sF0gZe';
const REDIRECTED_CART = 'Vt3K8mN1qR6wB9xC2jL5pY7dS4fH0gZa';
const DROPPED_CART = 'Rw7G2kD9sN4vJ1xL6pQ3yC8tM5fH0bZe';
const ERROR_PAGE_CART = 'Kd6P3xT8nV1qW5mH9cR2yJ7bL4sG0fZa';
const NO_ORDER_CART = 'Ty2M7bQ4kX9dN6wC1vH8pR3jF5sL0gZe';
const GATED_CART = 'Bn4H9cX2vK7qT1mW6rL3yD8pS5fJ0gZa';
const LOST_BODY_CART = 'Ls9V2xQ6nB4tK8mC1wR7yH3pD5fJ0gZe';
const LOST_REFUSAL_CART = 'Xc1R8mT5kQ3vN7wB2jL9yH4pD6fS0gZa';
const HUNG_CART = 'Hg6Y3bN8kW2qT9mC4xR1vL7pD5fJ0sZe';
const HOPPING_CART = 'Pj7D2wK9nX4vQ1mC6tR3yL8bS5fH0gZa';
const UNHURRIED_CART = 'Uc4F8jM1xS6nQ3wV9kT2yB7pD5rH0gZe';
const LATE_HEADERS_CART = 'Nf5W1rC7kJ3xT9mQ2vL6yG8pB4sD0hZa';
const ODD_STATUS_CART = 'Sq3J9dP6kC1xT7mB4wL8yV2rH5fN0gZe';

const ERROR_PAGE = `<html><body>${'x'.repeat(5_000)}</body></html>`;

const ORDER_ID = '42';
const CHECKOUT = '/checkout';
const PAYMENT = '/payment/start';
const PAYMENT_ADDRESS = /\/payment\/start$/;
const STALLED_PAYMENT = '/payment/stalled';
const BROKEN_PAYMENT = '/payment/broken';
const ACME_PLACEMENT_PLACED = '/placed/rest/V1/acme-checkout/place';
const ACME_PLACEMENT_ODD = '/odd/rest/V1/acme-checkout/place';
const ELSEWHERE = '/elsewhere';
const NEXT_HOP = '/rest/main/V1/next-hop';
const REFUSED_AT_THE_FIREWALL = 'The shop refused the test order placement (403): Only a browser gets through.';

/** Far beyond every deadline here: the part of an answer that never comes. */
const NEVER_MS = 60_000;

/** A status outside HTTP's own range, which Node still answers with. */
const ODD_STATUS = 999;

/** How long a shop that is merely unhurried takes to answer. */
const UNHURRIED_MS = 400;

/** How long the headers of a late answer take, and a deadline they arrive well inside of. */
const LATE_HEADERS_MS = 1_000;
const ONE_DEADLINE_MS = 1_500;

/** The name of the proof header as a server reads it. */
const RECEIVED_PROOF_HEADER = TEST_ORDER_PROOF_HEADER.toLowerCase();

const SIGNER: PlacementSigner = { headersFor: cart => ({ [TEST_ORDER_PROOF_HEADER]: `proof-of-${cart}` }) };

const PLACEMENT_BODY = JSON.stringify({ cartId: CART, paymentMethod: { method: 'checkmo' } });
const GRAPHQL_BODY = JSON.stringify({ query: 'mutation { placeOrder(input: { cart_id: "x" }) { orderV2 { number } } }' });
const GRAPHQL_PAYING_BODY = JSON.stringify({ query: 'mutation { setPaymentMethodAndPlaceOrder(input: { cart_id: "x" }) { order { order_number } } }' });
const GRAPHQL_COMPLETING_BODY = JSON.stringify({ query: 'mutation { completeOrder(input: { cart_id: "x" }) { order { order_number } } }' });

/** The address of a guest cart's placement at the REST API `base`. */
const placementAt = (base: string, cart: string): string => `${base}/guest-carts/${cart}/payment-information`;

const ACCEPTED = { body: ORDER_ID, type: 'application/json' };

let shop: PageServer;
let elsewhere: PageServer;

test.beforeEach(async () => {
    elsewhere = await PageServer.start({});
    shop = await PageServer.start({
        [CHECKOUT]: { body: '<!doctype html><html><body><p>checkout</p></body></html>', type: 'text/html' },
        [PAYMENT]: { body: '<!doctype html><html><body><p>payment</p></body></html>', type: 'text/html' },
        [STALLED_PAYMENT]: { body: '', delayMs: 60_000 },
        [BROKEN_PAYMENT]: { status: 500, body: 'broken', type: 'text/plain' },
        [ACME_PLACEMENT]: { body: '{"next":"payment"}', type: 'application/json' },
        [ACME_PLACEMENT_PLACED]: { body: '{"orderId":"100000042"}', type: 'application/json' },
        [ACME_PLACEMENT_ODD]: { body: '{"odd":true}', type: 'application/json' },
        [placementAt('/rest/main/V1', CART)]: ACCEPTED,
        [placementAt('/rest/V1', CART)]: ACCEPTED,
        [placementAt('/fr/rest/fr/V1', CART)]: ACCEPTED,
        [placementAt('/rest/main/V1', REFUSED_CART)]: {
            status: 400,
            body: JSON.stringify({ message: 'The payment method is not available.' }),
            type: 'application/json',
        },
        [placementAt('/rest/main/V1', REDIRECTED_CART)]: {
            status: 302,
            body: '',
            headers: { Location: elsewhere.url(ELSEWHERE) },
        },
        [placementAt('/rest/main/V1', DROPPED_CART)]: { body: '', dropConnection: true },
        [placementAt('/rest/main/V1', ERROR_PAGE_CART)]: { status: 502, body: ERROR_PAGE, type: 'text/html' },
        [placementAt('/rest/main/V1', NO_ORDER_CART)]: { body: ERROR_PAGE, type: 'text/html' },
        [placementAt('/rest/main/V1', GATED_CART)]: { ...ACCEPTED, browsersOnly: true },
        [placementAt('/rest/main/V1', LOST_BODY_CART)]: { ...ACCEPTED, bodyDelayMs: NEVER_MS },
        [placementAt('/rest/main/V1', LOST_REFUSAL_CART)]: {
            status: 500,
            body: JSON.stringify({ message: 'The placement failed.' }),
            type: 'application/json',
            bodyDelayMs: NEVER_MS,
        },
        [placementAt('/rest/main/V1', HUNG_CART)]: { body: ORDER_ID, delayMs: NEVER_MS },
        [placementAt('/rest/main/V1', HOPPING_CART)]: { status: 307, body: '', headers: { Location: NEXT_HOP } },
        [placementAt('/rest/main/V1', UNHURRIED_CART)]: { ...ACCEPTED, delayMs: UNHURRIED_MS },
        [placementAt('/rest/main/V1', ODD_STATUS_CART)]: { status: ODD_STATUS, body: ORDER_ID, type: 'application/json' },
        [placementAt('/rest/main/V1', LATE_HEADERS_CART)]: { ...ACCEPTED, delayMs: LATE_HEADERS_MS, bodyDelayMs: NEVER_MS },
        [NEXT_HOP]: ACCEPTED,
    });
});

test.afterEach(async () => {
    await shop.stop();
    await elsewhere.stop();
});

function termsOf(overrides: Partial<TestOrderPlacementTerms> = {}): TestOrderPlacementTerms {
    return { cart: CART, shopOrigins: new Set([shop.origin]), storePaths: new Set(['/', '/fr/']), signer: SIGNER, ...overrides };
}

/**
 * Sends what a checkout sends, from the page: the request, and once it has read an accepted answer the
 * browser on to the payment address. Says the answer's status, or that the request never got one.
 */
async function place(page: Page, url: string, body = PLACEMENT_BODY): Promise<number | 'no answer'> {
    return page.evaluate(async ({ target, payload, payment }) => {
        try {
            const answer = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });

            await answer.text();

            if (answer.ok) {
                setTimeout(() => { window.location.assign(payment); }, 0);
            }

            return answer.status;
        } catch {
            return 'no answer' as const;
        }
    }, { target: url, payload: body, payment: PAYMENT });
}

/** Places from the page without waiting for the answer. */
async function sendWithoutWaiting(page: Page, cart: string): Promise<void> {
    await page.evaluate(({ target, payload }) => {
        void fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    }, { target: shop.url(placementAt('/rest/main/V1', cart)), payload: PLACEMENT_BODY });
}

/** Carts that write down, in `order`, when the shop was asked to abandon one. */
function cartsWritingDown(order: string[]): TestOrderCarts {
    return new TestOrderCarts({
        abandon: reason => {
            order.push('abandon');

            return Promise.resolve({ kind: 'nothing-placed', reason });
        },
    });
}

/** What reached a server besides the pages the browser opened. */
function writesTo(server: PageServer): readonly Received[] {
    return server.received.filter(request => request.method !== 'GET');
}

test.describe('a signed test order placement', () => {
    const STORE_FORMS = [
        { form: 'with a store code', base: '/rest/main/V1' },
        { form: 'below a store\'s path', base: '/fr/rest/fr/V1' },
        { form: 'without a store code', base: '/rest/V1' },
    ];

    for (const { form, base } of STORE_FORMS) {
        test(`reaches the shop with the signer's headers ${form}, and the page goes on to payment`, async ({ page }) => {
            await page.goto(shop.url(CHECKOUT));

            const placements = await signTestOrderPlacements(page, termsOf(), PAYMENT_ADDRESS);

            expect(await place(page, shop.url(placementAt(base, CART)))).toBe(200);

            const placed = await placements.placedOrder();

            placements.stopWatching();
            expect(placed.maskedCartId).toBe(CART);
            expect(placed.orderId).toBe(ORDER_ID);
            expect(placed.paymentRedirect.url()).toBe(shop.url(PAYMENT));
            expect(placed.paymentRedirect.status()).toBe(200);

            const [received, ...others] = writesTo(shop);

            expect(others).toEqual([]);
            expect(received?.path).toBe(placementAt(base, CART));
            expect(received?.headers[RECEIVED_PROOF_HEADER]).toBe(`proof-of-${CART}`);
            expect(received?.body).toBe(PLACEMENT_BODY);
        });
    }

    test('that the shop refuses rejects with the shop\'s message', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ cart: REFUSED_CART }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', REFUSED_CART)))).toBe(400);
        await expect(placements.placedOrder()).rejects.toThrow(/400.*The payment method is not available\./);
        placements.stopWatching();
    });

    test('that a web server answers with an error page rejects quoting only its start', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ cart: ERROR_PAGE_CART }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', ERROR_PAGE_CART)))).toBe(502);
        await expect(placements.placedOrder()).rejects.toThrow(new RegExp(`\\(502\\): ${ERROR_PAGE.slice(0, 200)}$`));
        placements.stopWatching();
    });

    test('that the shop accepts without an order id rejects quoting only the start of its answer', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ cart: NO_ORDER_CART }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', NO_ORDER_CART)))).toBe(200);
        await expect(placements.placedOrder()).rejects.toThrow(new RegExp(`without an order id: ${ERROR_PAGE.slice(0, 200)}$`));
        placements.stopWatching();
    });

    test('that the shop redirects rejects naming the status, and its proof goes no further than the shop', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ cart: REDIRECTED_CART }), PAYMENT_ADDRESS);

        await place(page, shop.url(placementAt('/rest/main/V1', REDIRECTED_CART)));
        await expect(placements.placedOrder()).rejects.toThrow(/302/);
        placements.stopWatching();

        expect(writesTo(shop).map(request => request.headers[RECEIVED_PROOF_HEADER])).toEqual([`proof-of-${REDIRECTED_CART}`]);
        expect(elsewhere.received.filter(request => RECEIVED_PROOF_HEADER in request.headers)).toEqual([]);
    });
});

test.describe('a request that is not the test\'s own placement', () => {
    const STOPPED: readonly {
        readonly name: string;
        readonly address: () => string;
        readonly body?: string;
        readonly reason: RegExp;
    }[] = [
        {
            name: 'another cart',
            address: () => shop.url(placementAt('/rest/main/V1', OTHER_CART)),
            reason: new RegExp(`not for cart ${CART}`),
        },
        {
            name: 'a cart segment that is no valid escape',
            address: () => shop.url(placementAt('/rest/main/V1', '%E0%A4%A')),
            reason: /%E0%A4%A/,
        },
        {
            name: 'a signed-in customer\'s cart with a store code',
            address: () => shop.url('/rest/main/V1/carts/mine/payment-information'),
            reason: /placement routes names a cart/,
        },
        {
            name: 'a signed-in customer\'s cart below a store\'s path',
            address: () => shop.url('/fr/rest/fr/V1/carts/mine/payment-information'),
            reason: /placement routes names a cart/,
        },
        {
            name: 'a signed-in customer\'s cart without a store code',
            address: () => shop.url('/rest/V1/carts/mine/payment-information'),
            reason: /placement routes names a cart/,
        },
        {
            name: 'the test\'s own cart with a trailing slash',
            address: () => shop.url(`${placementAt('/rest/main/V1', CART)}/`),
            reason: /placement routes names a cart/,
        },
        {
            name: 'the test\'s own cart through the asynchronous API',
            address: () => shop.url(`/rest/main/async/V1/guest-carts/${CART}/payment-information`),
            reason: /placement routes names a cart/,
        },
        {
            name: 'the test\'s own cart through the bulk API',
            address: () => shop.url(`/rest/main/async/bulk/V1/guest-carts/${CART}/payment-information`),
            reason: /placement routes names a cart/,
        },
        {
            name: 'the test\'s own cart through the asynchronous API without a store code',
            address: () => shop.url(`/rest/async/V1/guest-carts/${CART}/payment-information`),
            reason: /placement routes names a cart/,
        },
        {
            name: 'the order call of a guest cart',
            address: () => shop.url(`/rest/main/V1/guest-carts/${CART}/order`),
            reason: /placement routes names a cart/,
        },
        {
            name: 'a GraphQL placement',
            address: () => shop.url('/graphql'),
            body: GRAPHQL_BODY,
            reason: /GraphQL order placement/,
        },
        {
            name: 'a GraphQL placement with a trailing slash',
            address: () => shop.url('/graphql/'),
            body: GRAPHQL_BODY,
            reason: /GraphQL order placement/,
        },
        {
            name: 'a GraphQL mutation that sets the payment method and places the order',
            address: () => shop.url('/graphql'),
            body: GRAPHQL_PAYING_BODY,
            reason: /GraphQL order placement/,
        },
        {
            name: 'a GraphQL mutation that completes an order through a payment service',
            address: () => shop.url('/graphql'),
            body: GRAPHQL_COMPLETING_BODY,
            reason: /GraphQL order placement/,
        },
        {
            name: 'the test\'s own cart at a path below no store',
            address: () => shop.url(placementAt('/anything/rest/V1', CART)),
            reason: /placement routes names a cart/,
        },
        {
            name: 'a placement to another origin',
            address: () => elsewhere.url(placementAt('/rest/main/V1', CART)),
            reason: /not the shop/,
        },
    ];

    for (const client of SHOP_CLIENTS) {
        for (const { name, address, body, reason } of STOPPED) {
            test(`is stopped in the browser with the ${client} client: ${name}`, async ({ page }) => {
                await page.goto(shop.url(CHECKOUT));

                const placements = await signTestOrderPlacements(page, termsOf({ client }), PAYMENT_ADDRESS);

                expect(await place(page, address(), body)).toBe('no answer');
                await expect(placements.placedOrder()).rejects.toThrow(reason);
                placements.stopWatching();

                expect(writesTo(shop)).toEqual([]);
                expect(elsewhere.received).toEqual([]);
            });
        }
    }

    test('passes through untouched when it only reads the same address', async ({ page }) => {
        const asked: string[] = [];
        const signer: PlacementSigner = {
            headersFor: cart => {
                asked.push(cart);

                return SIGNER.headersFor(cart);
            },
        };

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ signer }), PAYMENT_ADDRESS);
        const path = placementAt('/rest/main/V1', CART);
        const status = await page.evaluate(async target => (await fetch(target)).status, shop.url(path));

        placements.stopWatching();

        expect(status).toBe(200);
        expect(asked).toEqual([]);
        expect(shop.requestsTo(path).map(request => request.method)).toEqual(['GET']);
        expect(shop.requestsTo(path).filter(request => RECEIVED_PROOF_HEADER in request.headers)).toEqual([]);
    });
});

test.describe('the way to payment', () => {
    const SUB_RESOURCES: readonly { readonly name: string; readonly load: (address: string) => void }[] = [
        {
            name: 'a fetch',
            load: address => {
                void fetch(address);
            },
        },
        {
            name: 'a script',
            load: address => {
                const tag = document.createElement('script');

                tag.src = address;
                document.head.append(tag);
            },
        },
        {
            name: 'a preload',
            load: address => {
                const tag = document.createElement('link');

                tag.rel = 'preload';
                tag.as = 'fetch';
                tag.href = address;
                document.head.append(tag);
            },
        },
        {
            name: 'a frame inside the page',
            load: address => {
                const tag = document.createElement('iframe');

                tag.src = address;
                document.body.append(tag);
            },
        },
    ];

    /** Sends the test's own placement from the page, as a checkout would, and stays on the page. */
    async function placeWithoutLeaving(page: Page): Promise<void> {
        await page.evaluate(async ({ target, payload }) => {
            await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        }, { target: shop.url(placementAt('/rest/main/V1', CART)), payload: PLACEMENT_BODY });
    }

    /** Sends the browser to an address of the shop. */
    async function goOn(page: Page, address: string): Promise<void> {
        await page.evaluate(target => { window.location.assign(target); }, address);
    }

    for (const { name, load } of SUB_RESOURCES) {
        test(`is the browser's navigation, not ${name} that matches the address`, async ({ page }) => {
            await page.goto(shop.url(CHECKOUT));

            const placements = await signTestOrderPlacements(page, termsOf(), PAYMENT_ADDRESS);
            const subResource = page.waitForRequest(request => request.url() === shop.url(PAYMENT));

            await placeWithoutLeaving(page);
            await page.evaluate(load, PAYMENT);
            await subResource;

            const placed = placements.placedOrder();

            await goOn(page, PAYMENT);

            const { paymentRedirect } = await placed;

            expect(paymentRedirect.request().isNavigationRequest()).toBe(true);
            expect(paymentRedirect.frame() === page.mainFrame()).toBe(true);
            placements.stopWatching();
        });
    }

    test('is found with an address pattern the caller used before, which remembers where it stopped', async ({ page }) => {
        test.setTimeout(8_000);

        const remembering = new RegExp(PAYMENT_ADDRESS.source, 'g');

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf(), remembering);

        await placeWithoutLeaving(page);

        expect(remembering.exec(shop.url(PAYMENT))).not.toBeNull();

        const placed = placements.placedOrder();

        await goOn(page, PAYMENT);

        expect((await placed).paymentRedirect.url()).toBe(shop.url(PAYMENT));
        placements.stopWatching();
    });

    test('rejects within the placement deadline when the shop stalls on it, naming what it waited for', async ({ page }) => {
        test.setTimeout(8_000);

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ deadlineMs: 500 }), /\/payment\/stalled$/);

        await placeWithoutLeaving(page);
        await goOn(page, STALLED_PAYMENT);

        await expect(placements.placedOrder()).rejects.toThrow('The way to payment: nothing arrived within 0.5 s.');
        placements.stopWatching();
    });

    test('rejects within the placement deadline when the browser never takes it', async ({ page }) => {
        test.setTimeout(8_000);

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ deadlineMs: 100 }), PAYMENT_ADDRESS);

        await placeWithoutLeaving(page);

        await expect(placements.placedOrder()).rejects.toThrow('The way to payment: nothing arrived within 0.1 s.');
        placements.stopWatching();
    });

    test('gives the placement itself the same deadline', async ({ page }) => {
        test.setTimeout(8_000);

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ deadlineMs: 100 }), PAYMENT_ADDRESS);

        await expect(placements.placedOrder()).rejects.toThrow('The test order placement: nothing arrived within 0.1 s.');
        placements.stopWatching();
    });
});

test.describe('a placement that may not be signed', () => {
    test('is stopped with the reason of a signer that throws', async ({ page }) => {
        const signer: PlacementSigner = {
            headersFor: () => {
                throw new Error('This cart is not one the test may sign.');
            },
        };

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ signer }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', CART)))).toBe('no answer');
        await expect(placements.placedOrder()).rejects.toThrow('This cart is not one the test may sign.');
        placements.stopWatching();

        expect(writesTo(shop)).toEqual([]);
    });

    test('is stopped with the reason of the project\'s refusal', async ({ page }) => {
        const refusal = (body: Readonly<Record<string, unknown>>): string =>
            `the placement of cart ${String(body.cartId)} carries a side effect`;

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ refusal }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', CART)))).toBe('no answer');
        await expect(placements.placedOrder()).rejects.toThrow(`the placement of cart ${CART} carries a side effect`);
        placements.stopWatching();

        expect(writesTo(shop)).toEqual([]);
    });

    test('is stopped at once with the message of a refusal that throws', async ({ page }) => {
        const refusal = (): string => {
            throw new Error('the project could not read the body');
        };

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ refusal }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', CART)))).toBe('no answer');
        await expect(placements.placedOrder()).rejects.toThrow('the project could not read the body');
        placements.stopWatching();

        expect(writesTo(shop)).toEqual([]);
    });
});

test.describe('a test that carries the order tag', () => {
    const PLACEMENT = placementAt('/rest/main/V1', CART);

    /** Sends a request from the page, as a checkout would. Says the answer's status, or that it never got one. */
    async function send(page: Page, method: string, url: string, body?: string): Promise<number | 'no answer'> {
        return page.evaluate(async ({ target, verb, payload }) => {
            try {
                const init = payload === undefined ? { method: verb } : { method: verb, body: payload };

                return (await fetch(target, init)).status;
            } catch {
                return 'no answer' as const;
            }
        }, { target: url, verb: method, payload: body });
    }

    const STOPPED: readonly {
        readonly name: string;
        readonly method: string;
        readonly address: string;
        readonly body?: string;
    }[] = [
        { name: 'a guest cart\'s placement with a store code', method: 'POST', address: PLACEMENT, body: PLACEMENT_BODY },
        { name: 'a guest cart\'s placement without a store code', method: 'POST', address: placementAt('/rest/V1', CART), body: PLACEMENT_BODY },
        { name: 'a guest cart\'s placement below a store\'s path', method: 'POST', address: placementAt('/fr/rest/fr/V1', CART), body: PLACEMENT_BODY },
        { name: 'a guest cart\'s placement at a path below no store', method: 'POST', address: placementAt('/anything/rest/V1', CART), body: PLACEMENT_BODY },
        { name: 'a guest cart\'s placement with a trailing slash', method: 'POST', address: `${PLACEMENT}/`, body: PLACEMENT_BODY },
        { name: 'a guest cart\'s placement through the asynchronous API', method: 'POST', address: placementAt('/rest/main/async/V1', CART), body: PLACEMENT_BODY },
        { name: 'a guest cart\'s placement through the asynchronous API without a store code', method: 'POST', address: placementAt('/rest/async/V1', CART), body: PLACEMENT_BODY },
        { name: 'a guest cart\'s placement through the bulk API', method: 'POST', address: placementAt('/rest/main/async/bulk/V1', CART), body: PLACEMENT_BODY },
        { name: 'a signed-in customer\'s placement', method: 'POST', address: '/rest/main/V1/carts/mine/payment-information', body: PLACEMENT_BODY },
        { name: 'the order call of a guest cart', method: 'PUT', address: `/rest/main/V1/guest-carts/${CART}/order`, body: PLACEMENT_BODY },
        { name: 'the order call of a signed-in customer', method: 'PUT', address: '/rest/main/V1/carts/mine/order', body: PLACEMENT_BODY },
        { name: 'a GraphQL placement', method: 'POST', address: '/graphql', body: GRAPHQL_BODY },
        { name: 'a GraphQL placement with a trailing slash', method: 'POST', address: '/graphql/', body: GRAPHQL_BODY },
        { name: 'a GraphQL mutation that sets the payment method and places the order', method: 'POST', address: '/graphql', body: GRAPHQL_PAYING_BODY },
        { name: 'a GraphQL mutation that completes an order through a payment service', method: 'POST', address: '/graphql', body: GRAPHQL_COMPLETING_BODY },
    ];

    for (const { name, method, address, body } of STOPPED) {
        test(`has it stopped unsigned, and the shop receives nothing: ${name}`, async ({ context, page }) => {
            const unsigned = await stopUnsignedPlacements(context);

            await page.goto(shop.url(CHECKOUT));

            expect(await send(page, method, shop.url(address), body)).toBe('no answer');
            expect(writesTo(shop)).toEqual([]);
            expect(unsigned.stopped()).toEqual([`${method} ${shop.url(address)}`]);
        });
    }

    test('has every unsigned placement remembered, in order', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context);

        await page.goto(shop.url(CHECKOUT));
        await send(page, 'POST', shop.url(PLACEMENT), PLACEMENT_BODY);
        await send(page, 'POST', shop.url('/graphql'), GRAPHQL_BODY);

        expect(unsigned.stopped()).toEqual([`POST ${shop.url(PLACEMENT)}`, `POST ${shop.url('/graphql')}`]);
    });

    test('has a placement signed on the page reach the shop with its proof', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context);

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf(), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(PLACEMENT))).toBe(200);

        const placed = await placements.placedOrder();

        placements.stopWatching();

        expect(placed.orderId).toBe(ORDER_ID);
        expect(unsigned.stopped()).toEqual([]);
        expect(writesTo(shop).map(request => request.headers[RECEIVED_PROOF_HEADER])).toEqual([`proof-of-${CART}`]);
    });

    test('has a placement the signing route stops counted by that route alone', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context);

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf(), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', OTHER_CART)))).toBe('no answer');
        await expect(placements.placedOrder()).rejects.toThrow(`not for cart ${CART}`);
        placements.stopWatching();

        expect(unsigned.stopped()).toEqual([]);
        expect(writesTo(shop)).toEqual([]);
    });

    test('reads the address of a placement', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context);

        await page.goto(shop.url(CHECKOUT));

        expect(await send(page, 'GET', shop.url(PLACEMENT))).toBe(200);
        expect(unsigned.stopped()).toEqual([]);
        expect(shop.requestsTo(PLACEMENT).map(request => request.method)).toEqual(['GET']);
    });

    test('sends any other GraphQL request', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context);
        const query = JSON.stringify({ query: '{ cart(cart_id: "x") { total_quantity } }' });

        await page.goto(shop.url(CHECKOUT));

        expect(await send(page, 'POST', shop.url('/graphql'), query)).toBe(200);
        expect(unsigned.stopped()).toEqual([]);
        expect(shop.requestsTo('/graphql').map(request => request.body)).toEqual([query]);
    });

    test('hands every other request on to the routes behind it', async ({ context, page }) => {
        const behind: string[] = [];

        await context.route('**/*', async route => {
            behind.push(new URL(route.request().url()).pathname);
            await route.fallback();
        });
        await stopUnsignedPlacements(context);
        await page.goto(shop.url(CHECKOUT));
        await send(page, 'GET', shop.url(PLACEMENT));
        await send(page, 'POST', shop.url(PLACEMENT), PLACEMENT_BODY);

        expect(behind).toEqual([CHECKOUT, PLACEMENT]);
    });
});

test.describe('a placement at a route the project declares', () => {
    const DECLARED_BODY = JSON.stringify({ cartId: CART, email: 'e2e+order@shop.test' });
    const OTHER_CART_BODY = JSON.stringify({ cartId: OTHER_CART });
    const STORE_PATHS = new Set(['/', '/fr/', '/placed/', '/odd/']);

    /** The terms of the test's cart with the declared checkout beside Magento's own. */
    function declaredTerms(overrides: Partial<TestOrderPlacementTerms> = {}): TestOrderPlacementTerms {
        return termsOf({ routes: [GUEST_PAYMENT_INFORMATION, ACME_CHECKOUT], storePaths: STORE_PATHS, ...overrides });
    }

    test('that creates its order after payment reaches the shop signed, and resolves without an order id once the page goes on to payment', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, declaredTerms(), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(ACME_PLACEMENT), DECLARED_BODY)).toBe(200);

        const placed = await placements.placedOrder();

        placements.stopWatching();

        expect(placed.orderId).toBeNull();
        expect(placed.maskedCartId).toBe(CART);
        expect(placed.paymentRedirect.url()).toBe(shop.url(PAYMENT));

        const [received, ...others] = writesTo(shop);

        expect(others).toEqual([]);
        expect(received?.path).toBe(ACME_PLACEMENT);
        expect(received?.headers[RECEIVED_PROOF_HEADER]).toBe(`proof-of-${CART}`);
        expect(received?.body).toBe(DECLARED_BODY);
    });

    test('that names its order resolves with the id the route read', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, declaredTerms(), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(ACME_PLACEMENT_PLACED), DECLARED_BODY)).toBe(200);
        expect((await placements.placedOrder()).orderId).toBe('100000042');
        placements.stopWatching();
    });

    test('is read by the route that signed it, not by the first route', async ({ page }) => {
        const asked: string[] = [];
        const recording = (name: string, route: PlacementRoute): PlacementRoute => ({
            stopped: route.stopped,
            cartOf: (path, body, storePaths) => route.cartOf(path, body, storePaths),
            outcomeOf: answer => {
                asked.push(name);

                return route.outcomeOf(answer);
            },
        });
        const routes = [recording('own', GUEST_PAYMENT_INFORMATION), recording('declared', ACME_CHECKOUT)];

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, declaredTerms({ routes }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(ACME_PLACEMENT), DECLARED_BODY)).toBe(200);
        await placements.placedOrder();
        placements.stopWatching();

        expect(asked).toEqual(['declared']);
    });

    test('rejects with the route\'s reason when the answer is not what the route publishes', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, declaredTerms(), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(ACME_PLACEMENT_ODD), DECLARED_BODY)).toBe(200);
        await expect(placements.placedOrder()).rejects.toThrow('The checkout answered neither an order nor the way to payment.');
        placements.stopWatching();
    });

    test('that creates its order after payment still waits for the way to payment', async ({ page }) => {
        test.setTimeout(8_000);

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, declaredTerms({ deadlineMs: 200 }), PAYMENT_ADDRESS);

        await page.evaluate(async ({ target, payload }) => {
            await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        }, { target: shop.url(ACME_PLACEMENT), payload: DECLARED_BODY });

        await expect(placements.placedOrder()).rejects.toThrow('The way to payment: nothing arrived within 0.2 s.');
        placements.stopWatching();
    });

    test('rejects without naming an order when the shop fails on the way to payment', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, declaredTerms(), /\/payment\/broken$/);

        await page.evaluate(async ({ target, payload, payment }) => {
            await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
            window.location.assign(payment);
        }, { target: shop.url(ACME_PLACEMENT), payload: DECLARED_BODY, payment: BROKEN_PAYMENT });

        await expect(placements.placedOrder()).rejects.toThrow('The shop did not send the test order on to payment: 500.');
        placements.stopWatching();
    });

    const STOPPED: readonly {
        readonly name: string;
        readonly address: () => string;
        readonly body: string;
        readonly reason: RegExp;
    }[] = [
        { name: 'another cart', address: () => shop.url(ACME_PLACEMENT), body: OTHER_CART_BODY, reason: new RegExp(`not for cart ${CART}`) },
        { name: 'another origin', address: () => elsewhere.url(ACME_PLACEMENT), body: DECLARED_BODY, reason: /not the shop/ },
        { name: 'a path below no store', address: () => shop.url(`/anything${ACME_PLACEMENT}`), body: DECLARED_BODY, reason: /placement routes names a cart/ },
        { name: 'a body that is not a JSON object', address: () => shop.url(ACME_PLACEMENT), body: 'cartId=1', reason: /not the JSON object/ },
        { name: 'an address the route only stops', address: () => shop.url(`${ACME_PLACEMENT}/again`), body: DECLARED_BODY, reason: /placement routes names a cart/ },
        { name: 'Magento\'s own placement of another cart', address: () => shop.url(placementAt('/rest/main/V1', OTHER_CART)), body: PLACEMENT_BODY, reason: new RegExp(`not for cart ${CART}`) },
        { name: 'a GraphQL placement', address: () => shop.url('/graphql'), body: GRAPHQL_BODY, reason: /GraphQL order placement/ },
    ];

    for (const { name, address, body, reason } of STOPPED) {
        test(`is stopped in the browser: ${name}`, async ({ page }) => {
            await page.goto(shop.url(CHECKOUT));

            const placements = await signTestOrderPlacements(page, declaredTerms(), PAYMENT_ADDRESS);

            expect(await place(page, address(), body)).toBe('no answer');
            await expect(placements.placedOrder()).rejects.toThrow(reason);
            placements.stopWatching();

            expect(writesTo(shop)).toEqual([]);
            expect(elsewhere.received).toEqual([]);
        });
    }

    test('is stopped with Magento\'s own placement too, when the project declares only its own checkout', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, declaredTerms({ routes: [ACME_CHECKOUT] }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', CART)))).toBe('no answer');
        await expect(placements.placedOrder()).rejects.toThrow(/placement routes names a cart/);
        placements.stopWatching();

        expect(writesTo(shop)).toEqual([]);
    });

    test('lets a read of the same address through untouched', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, declaredTerms(), PAYMENT_ADDRESS);
        const status = await page.evaluate(async target => (await fetch(target)).status, shop.url(ACME_PLACEMENT));

        placements.stopWatching();

        expect(status).toBe(200);
        expect(shop.requestsTo(ACME_PLACEMENT).filter(request => RECEIVED_PROOF_HEADER in request.headers)).toEqual([]);
    });
});

test.describe('a test that carries the order tag, in a project that declares a route', () => {
    const ROUTES = [GUEST_PAYMENT_INFORMATION, ACME_CHECKOUT];
    const DECLARED_BODY = JSON.stringify({ cartId: CART });

    test('has a write to the route stopped unsigned, and the shop receives nothing', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context, ROUTES);

        await page.goto(shop.url(CHECKOUT));

        expect(await place(page, shop.url(ACME_PLACEMENT), DECLARED_BODY)).toBe('no answer');
        expect(writesTo(shop)).toEqual([]);
        expect(unsigned.stopped()).toEqual([`POST ${shop.url(ACME_PLACEMENT)}`]);
    });

    test('has the same write reach the shop where nobody declared the route', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context);

        await page.goto(shop.url(CHECKOUT));

        expect(await place(page, shop.url(ACME_PLACEMENT), DECLARED_BODY)).toBe(200);
        expect(writesTo(shop).map(request => request.path)).toEqual([ACME_PLACEMENT]);
        expect(unsigned.stopped()).toEqual([]);
    });

    test('has the same write reach the shop signed, and nothing stopped, once the page signs it', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context, ROUTES);

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ routes: ROUTES }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(ACME_PLACEMENT), DECLARED_BODY)).toBe(200);
        await placements.placedOrder();
        placements.stopWatching();

        expect(unsigned.stopped()).toEqual([]);
        expect(writesTo(shop).map(request => request.headers[RECEIVED_PROOF_HEADER])).toEqual([`proof-of-${CART}`]);
    });

    test('keeps Magento\'s own addresses and GraphQL stopped when the project declares only its own checkout', async ({ context, page }) => {
        const unsigned = await stopUnsignedPlacements(context, [ACME_CHECKOUT]);
        const placement = shop.url(placementAt('/rest/main/V1', CART));

        await page.goto(shop.url(CHECKOUT));

        expect(await place(page, placement)).toBe('no answer');
        expect(await place(page, shop.url('/graphql'), GRAPHQL_BODY)).toBe('no answer');
        expect(writesTo(shop)).toEqual([]);
        expect(unsigned.stopped()).toEqual([`POST ${placement}`, `POST ${shop.url('/graphql')}`]);
    });

    test('registers each pattern once, however many routes share it', async ({ context }) => {
        const registered: unknown[] = [];
        const route = context.route.bind(context);
        const sharing: PlacementRoute = { ...ACME_CHECKOUT, stopped: new RegExp(ACME_CHECKOUT.stopped.source) };

        context.route = async (url, handler, options) => {
            registered.push(url);

            return route(url, handler, options);
        };
        await stopUnsignedPlacements(context, [GUEST_PAYMENT_INFORMATION, ACME_CHECKOUT, sharing]);

        expect(registered.map(String)).toEqual([
            String(GUEST_PAYMENT_INFORMATION.stopped),
            String(ACME_CHECKOUT.stopped),
            String(/\/graphql(\/|\?|$)/),
        ]);
    });

    test('stops every write at a pattern that remembers where it stopped', async ({ context, page }) => {
        const remembering: PlacementRoute = { ...ACME_CHECKOUT, stopped: new RegExp(ACME_CHECKOUT.stopped.source, 'g') };
        const unsigned = await stopUnsignedPlacements(context, [remembering]);

        await page.goto(shop.url(CHECKOUT));

        expect(await place(page, shop.url(ACME_PLACEMENT), DECLARED_BODY)).toBe('no answer');
        expect(await place(page, shop.url(ACME_PLACEMENT), DECLARED_BODY)).toBe('no answer');
        expect(writesTo(shop)).toEqual([]);
        expect(unsigned.stopped()).toHaveLength(2);
    });
});

test.describe('a placement the browser sends', () => {
    /** The terms of a cart whose placement the browser sends. */
    function browserTerms(cart: string, overrides: Partial<TestOrderPlacementTerms> = {}): TestOrderPlacementTerms {
        return termsOf({ cart, client: 'browser', ...overrides });
    }

    /**
     * Places at `address` from the page, which reads the answer as a checkout does and stays until the
     * test has read it too, then goes on to payment. A page that leaves at once can take the body along,
     * however quick the page was to read it.
     */
    async function placeAndGoOnAfterTheAnswer(page: Page, terms: TestOrderPlacementTerms, address: string, body: string): Promise<PlacedTestOrder> {
        const waits: Promise<unknown>[] = [];
        const placements = await signTestOrderPlacements(page, { ...terms, awaitingAnswer: waited => waits.push(waited) }, PAYMENT_ADDRESS);

        await page.evaluate(async ({ target, payload }) => {
            await (await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })).text();
        }, { target: address, payload: body });
        await Promise.all(waits);
        await page.evaluate(payment => { window.location.assign(payment); }, PAYMENT);

        const placed = await placements.placedOrder();

        placements.stopWatching();

        return placed;
    }

    /** Places from the page and goes on to the payment address the moment the answer's status has arrived, whatever it is. */
    async function placeAndLeave(page: Page, cart: string): Promise<void> {
        await page.evaluate(async ({ target, payload, payment }) => {
            await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
            window.location.assign(payment);
        }, { target: shop.url(placementAt('/rest/main/V1', cart)), payload: PLACEMENT_BODY, payment: PAYMENT });
    }

    /** Sends a placement of `CART` through the browser client, with its `route.continue()` left to `continuing`. */
    async function sendWithContinue(
        page: Page,
        continuing: (goOn: () => Promise<void>) => Promise<void>,
        deadlineMs: number,
        report: (attempt: PlacementAttempt | Promise<PlacementAttempt>) => void,
    ): Promise<void> {
        await page.route('**/payment-information', async route => {
            const goOn = route.continue.bind(route);

            route.continue = options => continuing(() => goOn(options));

            await PLACEMENT_SENDERS.browser({
                page,
                route,
                maskedCartId: CART,
                placement: GUEST_PAYMENT_INFORMATION,
                proof: SIGNER.headersFor(CART),
                deadlineMs,
                report,
            });
        });
        await sendWithoutWaiting(page, CART);
    }

    /** Every report of a placement whose continue goes as `continuing` says, settled, and what was left to reject after them. */
    async function reportsOfContinue(
        page: Page,
        continuing: (goOn: () => Promise<void>) => Promise<void>,
    ): Promise<{ attempts: readonly PlacementAttempt[]; unhandled: readonly unknown[] }> {
        const unhandled: unknown[] = [];
        const listen = (reason: unknown): void => {
            unhandled.push(reason);
        };
        const reports: Promise<PlacementAttempt>[] = [];

        process.on('unhandledRejection', listen);
        await page.goto(shop.url(CHECKOUT));
        await sendWithContinue(page, continuing, 300, attempt => reports.push(Promise.resolve(attempt)));
        await expect.poll(() => reports.length).toBe(1);

        const attempts = await Promise.all(reports);

        await new Promise(resolve => {
            setTimeout(resolve, 400);
        });
        process.off('unhandledRejection', listen);

        expect(reports).toHaveLength(1);

        return { attempts, unhandled };
    }

    test('is the browser\'s own request: a firewall that lets only browsers through opens, with the page\'s cookies and the proof', async ({ context, page }) => {
        await context.addCookies([{ name: 'session', value: 'visitor-session-value', url: shop.origin }]);
        await page.goto(shop.url(CHECKOUT));

        const placed = await placeAndGoOnAfterTheAnswer(page, browserTerms(GATED_CART), shop.url(placementAt('/rest/main/V1', GATED_CART)), PLACEMENT_BODY);

        expect(placed.orderId).toBe(ORDER_ID);
        expect(placed.maskedCartId).toBe(GATED_CART);

        const [received, ...others] = writesTo(shop);

        expect(others).toEqual([]);
        expect(received?.headers[RECEIVED_PROOF_HEADER]).toBe(`proof-of-${GATED_CART}`);
        expect(received?.cookie).toContain('session=visitor-session-value');
        expect(received?.body).toBe(PLACEMENT_BODY);
    });

    test('is what opens that firewall: the runner, with the same cookies, is refused there', async ({ context, page }) => {
        await context.addCookies([{ name: 'session', value: 'visitor-session-value', url: shop.origin }]);
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, termsOf({ cart: GATED_CART, client: 'runner' }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', GATED_CART)))).toBe(403);
        await expect(placements.placedOrder()).rejects.toThrow(REFUSED_AT_THE_FIREWALL);
        placements.stopWatching();

        expect(writesTo(shop).map(request => request.cookie)).toEqual([expect.stringContaining('session=visitor-session-value')]);
    });

    test('whose answer\'s body a following navigation takes away resolves without an order id, and asks no route', async ({ page }) => {
        const asked: string[] = [];
        const route: PlacementRoute = {
            ...GUEST_PAYMENT_INFORMATION,
            outcomeOf: answer => {
                asked.push(answer);

                return GUEST_PAYMENT_INFORMATION.outcomeOf(answer);
            },
        };

        test.setTimeout(8_000);
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, browserTerms(LOST_BODY_CART, { routes: [route] }), PAYMENT_ADDRESS);

        await placeAndLeave(page, LOST_BODY_CART);

        const placed = await placements.placedOrder();

        placements.stopWatching();

        expect(placed.orderId).toBeNull();
        expect(placed.maskedCartId).toBe(LOST_BODY_CART);
        expect(placed.paymentRedirect.url()).toBe(shop.url(PAYMENT));
        expect(asked).toEqual([]);
    });

    test('that the shop refuses rejects with the shop\'s message', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, browserTerms(REFUSED_CART), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', REFUSED_CART)))).toBe(400);
        await expect(placements.placedOrder()).rejects.toThrow(/\(400\): The payment method is not available\./);
        placements.stopWatching();
    });

    test('that the shop answers with a 500 rejects naming the status, with the body lost as well', async ({ page }) => {
        test.setTimeout(8_000);
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, browserTerms(LOST_REFUSAL_CART), PAYMENT_ADDRESS);

        await placeAndLeave(page, LOST_REFUSAL_CART);
        await expect(placements.placedOrder()).rejects.toThrow(/^The shop refused the test order placement \(500\)$/);
        placements.stopWatching();
    });

    test('that the shop redirects fails saying the proof went with the redirect, and the redirect\'s hop is neither routed nor judged', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, browserTerms(HOPPING_CART), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', HOPPING_CART)))).toBe(200);
        await expect(placements.placedOrder()).rejects.toThrow(
            `The shop redirected the test order placement (307), and its proof went with the redirect to ${NEXT_HOP}.`,
        );
        placements.stopWatching();

        expect(writesTo(shop).map(request => [request.path, request.headers[RECEIVED_PROOF_HEADER]])).toEqual([
            [placementAt('/rest/main/V1', HOPPING_CART), `proof-of-${HOPPING_CART}`],
            [NEXT_HOP, `proof-of-${HOPPING_CART}`],
        ]);
    });

    test('that the server never answers is unanswered and fails at the deadline, naming nothing that was sent', async ({ page }) => {
        const PROOF = 'proof-that-stays-out-of-the-message';

        test.setTimeout(8_000);
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(
            page,
            browserTerms(HUNG_CART, { signer: { headersFor: () => ({ [TEST_ORDER_PROOF_HEADER]: PROOF }) }, deadlineMs: 400 }),
            PAYMENT_ADDRESS,
        );
        const failure = placements.placedOrder().then(() => undefined, (error: unknown) => error);

        // Later than the wait above began, so only the wait for the answer can end the wait at this message.
        await new Promise(resolve => {
            setTimeout(resolve, 200);
        });
        await sendWithoutWaiting(page, HUNG_CART);

        const rejection = await failure;

        placements.stopWatching();

        expect(rejection).toBeInstanceOf(Error);
        expect(String(rejection)).toContain('The test order placement never got an answer: The shop\'s answer: nothing arrived within 0.4 s.');
        expect(String(rejection)).not.toContain(PROOF);
        expect(String(rejection)).not.toContain(HUNG_CART);
        expect(writesTo(shop).map(request => request.headers[RECEIVED_PROOF_HEADER])).toEqual([PROOF]);
    });

    test('whose connection drops is unanswered, with the browser\'s reason', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, browserTerms(DROPPED_CART), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', DROPPED_CART)))).toBe('no answer');
        await expect(placements.placedOrder()).rejects.toThrow(/^The test order placement never got an answer: net::ERR_/);
        placements.stopWatching();
    });

    test('is read by the route that signed it, not by the first route', async ({ page }) => {
        const asked: string[] = [];
        const recording = (name: string, route: PlacementRoute): PlacementRoute => ({
            ...route,
            outcomeOf: answer => {
                asked.push(name);

                return route.outcomeOf(answer);
            },
        });
        const routes = [recording('own', GUEST_PAYMENT_INFORMATION), recording('declared', ACME_CHECKOUT)];

        await page.goto(shop.url(CHECKOUT));

        await placeAndGoOnAfterTheAnswer(page, browserTerms(CART, { routes }), shop.url(ACME_PLACEMENT), JSON.stringify({ cartId: CART }));

        expect(asked).toEqual(['declared']);
    });

    test('is stopped with the reason of a signer that throws, and nothing leaves', async ({ page }) => {
        const signer: PlacementSigner = {
            headersFor: () => {
                throw new Error('This cart is not one the test may sign.');
            },
        };

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(page, browserTerms(CART, { signer }), PAYMENT_ADDRESS);

        expect(await place(page, shop.url(placementAt('/rest/main/V1', CART)))).toBe('no answer');
        await expect(placements.placedOrder()).rejects.toThrow('This cart is not one the test may sign.');
        placements.stopWatching();

        expect(writesTo(shop)).toEqual([]);
    });

    test('holds the clean-up back until the shop has answered it', async ({ page }) => {
        const order: string[] = [];
        const holds: Promise<unknown>[] = [];
        const carts = cartsWritingDown(order);

        await page.goto(shop.url(CHECKOUT));
        carts.record(HUNG_CART);

        const placements = await signTestOrderPlacements(
            page,
            browserTerms(HUNG_CART, {
                deadlineMs: 300,
                awaitingAnswer: waited => {
                    holds.push(waited);
                    carts.holdCleanUpFor(waited.then(() => {
                        order.push('answered');
                    }));
                },
            }),
            PAYMENT_ADDRESS,
        );

        await sendWithoutWaiting(page, HUNG_CART);
        await expect.poll(() => holds.length).toBe(1);
        await carts.abandonLeftovers();
        placements.stopWatching();

        expect(order).toEqual(['answered', 'abandon']);
    });

    test('holds the clean-up back from the moment it leaves, with the continue still on its way', async ({ page }) => {
        const order: string[] = [];
        const carts = cartsWritingDown(order);
        let leaving = false;

        await page.goto(shop.url(CHECKOUT));
        carts.record(CART);
        await sendWithContinue(
            page,
            async goOn => {
                leaving = true;
                await new Promise(resolve => {
                    setTimeout(resolve, UNHURRIED_MS);
                });
                await goOn();
            },
            5_000,
            attempt => {
                carts.holdCleanUpFor(Promise.resolve(attempt).then(() => {
                    order.push('answered');
                }));
            },
        );
        await expect.poll(() => leaving).toBe(true);
        await carts.abandonLeftovers();

        expect(order).toEqual(['answered', 'abandon']);
        expect(writesTo(shop)).toHaveLength(1);
    });

    test('whose continue fails is reported once, with the reason, and leaves nothing to reject', async ({ page }) => {
        const { attempts, unhandled } = await reportsOfContinue(page, () => Promise.reject(new Error('The route could not go on.')));

        expect(attempts).toEqual([{ kind: 'unanswered', reason: 'The route could not go on.' }]);
        expect(unhandled).toEqual([]);
    });

    test('whose page goes before the continue is reported once, by the deadline, and leaves nothing to reject', async ({ page }) => {
        test.setTimeout(8_000);

        const { attempts, unhandled } = await reportsOfContinue(page, async goOn => {
            await page.close();
            await goOn();
        });

        expect(attempts).toEqual([expect.objectContaining({ kind: 'unanswered' })]);
        expect(unhandled).toEqual([]);
    });

    test('settles by its one deadline when the headers come late and the body stalls', async ({ page }) => {
        const waits: Promise<unknown>[] = [];

        test.setTimeout(8_000);
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(
            page,
            browserTerms(LATE_HEADERS_CART, { deadlineMs: ONE_DEADLINE_MS, awaitingAnswer: waited => waits.push(waited) }),
            PAYMENT_ADDRESS,
        );
        const sentAt = performance.now();

        await sendWithoutWaiting(page, LATE_HEADERS_CART);
        await expect.poll(() => waits.length).toBe(1);

        const attempts = await Promise.all(waits);
        const tookMs = performance.now() - sentAt;

        placements.stopWatching();

        expect(attempts).toEqual([expect.objectContaining({ kind: 'answered', status: 200, body: null })]);
        // Halfway between one deadline and a deadline for the headers followed by another for the body.
        expect(tookMs).toBeLessThan(ONE_DEADLINE_MS + LATE_HEADERS_MS / 2);
    });

    test('leaves nothing to reject once its page is gone', async ({ context }) => {
        const unhandled: unknown[] = [];
        const listen = (reason: unknown): void => {
            unhandled.push(reason);
        };
        const page = await context.newPage();
        const waits: Promise<unknown>[] = [];

        process.on('unhandledRejection', listen);
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(
            page,
            browserTerms(HUNG_CART, { deadlineMs: 300, awaitingAnswer: waited => waits.push(waited) }),
            PAYMENT_ADDRESS,
        );

        await sendWithoutWaiting(page, HUNG_CART);
        await expect.poll(() => writesTo(shop).length).toBe(1);
        await page.close();

        await expect(placements.placedOrder()).rejects.toThrow('The test order placement never got an answer');
        expect(await Promise.allSettled(waits)).toEqual([{ status: 'fulfilled', value: expect.anything() }]);

        await new Promise(resolve => {
            setTimeout(resolve, 50);
        });
        process.off('unhandledRejection', listen);
        expect(unhandled).toEqual([]);
    });
});

test.describe('a placement the runner sends', () => {
    /**
     * Places `cart` without waiting, and runs the clean-up where a test that times out meets it: the shop
     * has the placement and has not answered. Says, in order, when the wait settled and when the shop was
     * asked to abandon.
     */
    async function cleanUpWhileOnItsWay(page: Page, cart: string, deadlineMs: number): Promise<{ order: readonly string[]; placements: SignedPlacements }> {
        const order: string[] = [];
        const carts = cartsWritingDown(order);

        await page.goto(shop.url(CHECKOUT));
        carts.record(cart);

        const placements = await signTestOrderPlacements(
            page,
            termsOf({
                cart,
                deadlineMs,
                awaitingAnswer: waited => {
                    carts.holdCleanUpFor(waited.then(() => {
                        order.push('answered');
                    }));
                },
            }),
            PAYMENT_ADDRESS,
        );

        await sendWithoutWaiting(page, cart);
        await expect.poll(() => writesTo(shop).length).toBe(1);
        await carts.abandonLeftovers();

        return { order, placements };
    }

    test('holds the clean-up back from the moment it leaves until the shop has answered it', async ({ page }) => {
        const { order, placements } = await cleanUpWhileOnItsWay(page, UNHURRIED_CART, 5_000);

        placements.stopWatching();

        expect(order).toEqual(['answered', 'abandon']);
    });

    for (const [what, cart] of [['the answer', HUNG_CART], ['the answer\'s body', LOST_BODY_CART]] as const) {
        test(`lets the clean-up go at the deadline when the shop never sends ${what}`, async ({ page }) => {
            test.setTimeout(8_000);

            const { order, placements } = await cleanUpWhileOnItsWay(page, cart, 300);

            await expect(placements.placedOrder()).rejects.toThrow('The test order placement never got an answer');
            placements.stopWatching();

            expect(order).toEqual(['answered', 'abandon']);
        });
    }

    test('leaves nothing to reject once its page is gone', async ({ context }) => {
        const unhandled: unknown[] = [];
        const listen = (reason: unknown): void => {
            unhandled.push(reason);
        };
        const page = await context.newPage();
        const waits: Promise<unknown>[] = [];

        process.on('unhandledRejection', listen);
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(
            page,
            termsOf({ cart: UNHURRIED_CART, awaitingAnswer: waited => waits.push(waited) }),
            PAYMENT_ADDRESS,
        );

        await sendWithoutWaiting(page, UNHURRIED_CART);
        await expect.poll(() => writesTo(shop).length).toBe(1);
        await page.close();

        expect(await Promise.allSettled(waits)).toEqual([{ status: 'fulfilled', value: expect.anything() }]);
        placements.stopWatching();

        await new Promise(resolve => {
            setTimeout(resolve, 50);
        });
        process.off('unhandledRejection', listen);
        expect(unhandled).toEqual([]);
    });

    test('hands the page even a status no shop should send, and the shop\'s refusal stands', async ({ page }) => {
        const waits: Promise<unknown>[] = [];

        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(
            page,
            termsOf({ cart: ODD_STATUS_CART, awaitingAnswer: waited => waits.push(waited) }),
            PAYMENT_ADDRESS,
        );

        expect(await place(page, shop.url(placementAt('/rest/main/V1', ODD_STATUS_CART)))).toBe(ODD_STATUS);
        expect(await Promise.all(waits)).toEqual([expect.objectContaining({ kind: 'answered', status: ODD_STATUS, body: ORDER_ID })]);
        await expect(placements.placedOrder()).rejects.toThrow(`The shop refused the test order placement (${String(ODD_STATUS)})`);
        placements.stopWatching();
    });

    test('whose answer the browser turns down leaves the handler with nothing to reject, and the shop\'s answer stands', async ({ page }) => {
        const attempts: PlacementAttempt[] = [];
        let ending: unknown;

        await page.goto(shop.url(CHECKOUT));
        await page.route('**/payment-information', async route => {
            const handOver = route.fulfill.bind(route);

            // No answer of a real shop gets this far: what is copied is the order of events of a browser
            // that turns one down, with the route counted as handled by the time the failure arrives.
            route.fulfill = async options => {
                await handOver(options);
                throw new Error('The browser turned the answer down.');
            };

            ending = await PLACEMENT_SENDERS.runner({
                page,
                route,
                maskedCartId: CART,
                placement: GUEST_PAYMENT_INFORMATION,
                proof: SIGNER.headersFor(CART),
                deadlineMs: 5_000,
                report: attempt => {
                    void Promise.resolve(attempt).then(settled => attempts.push(settled));
                },
            }).then(() => 'ended', (error: unknown) => error);
        });

        await place(page, shop.url(placementAt('/rest/main/V1', CART)));
        await expect.poll(() => ending).not.toBeUndefined();

        expect(ending).toBe('ended');
        expect(attempts).toEqual([expect.objectContaining({ kind: 'answered', status: 200, body: ORDER_ID })]);
    });
});

test.describe('a request that fails', () => {
    const PROOFS = new TestOrderProofs('browser-spec-secret-0123456789abcdef-long', systemClock);
    const PROVEN_SIGNER: PlacementSigner = { headersFor: cart => PROOFS.headersFor('place', cart) };
    const PROOF_SHAPE = /\d{10}\.[0-9a-f]{64}/;
    const COOKIE = 'visitor-session-value';
    const DROPPED_PLACEMENT = placementAt('/rest/main/V1', DROPPED_CART);

    /** The address of a server that has stopped, where nothing answers. */
    async function deadOrigin(): Promise<string> {
        const server = await PageServer.start({});
        const { origin } = server;

        await server.stop();

        return origin;
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
        const text = `${error.message}\n${error.stack ?? ''}`;

        expect(text).not.toMatch(PROOF_SHAPE);
        expect(text).not.toContain(COOKIE);
        expect(text).not.toContain('Call log:');
        expect(error.cause).toBeUndefined();
    }

    test.beforeEach(async ({ context }) => {
        await context.addCookies([{ name: 'session', value: COOKIE, url: shop.origin }]);
    });

    test('holds the proof and the cookie in Playwright\'s own error, before anything cleans it', async ({ page }) => {
        const dead = await deadOrigin();
        const headers = PROOFS.headersFor('recognise', 'recognition');
        const raw = await rejectionOf(page.request.post(`${dead}/rest/main/V1/test-orders/recognition`, { headers, data: {} }));

        expect(raw.message).toMatch(PROOF_SHAPE);
        expect(raw.message).toContain(COOKIE);
    });

    test('holds the proof in the error of a raw route.fetch(), before anything cleans it', async ({ page }) => {
        let raw: Error | undefined;

        await page.goto(shop.url(CHECKOUT));
        await page.route('**/payment-information', async route => {
            raw = await rejectionOf(route.fetch({ headers: { ...route.request().headers(), ...PROVEN_SIGNER.headersFor(DROPPED_CART) } }));
            await route.abort('failed');
        });
        await place(page, shop.url(DROPPED_PLACEMENT));

        expect(raw?.message).toMatch(PROOF_SHAPE);
    });

    test('leaves a signed placement\'s rejection without the proof or the cookie, and with the reason', async ({ page }) => {
        await page.goto(shop.url(CHECKOUT));

        const placements = await signTestOrderPlacements(
            page,
            termsOf({ cart: DROPPED_CART, signer: PROVEN_SIGNER }),
            PAYMENT_ADDRESS,
        );

        expect(await place(page, shop.url(DROPPED_PLACEMENT))).toBe('no answer');

        const failure = await rejectionOf(placements.placedOrder());

        placements.stopWatching();

        expect(writesTo(shop).map(request => request.headers[RECEIVED_PROOF_HEADER])).toEqual([expect.stringMatching(PROOF_SHAPE)]);
        expect(failure.message).toContain('The test order placement never got an answer');
        expect(failure.message).toContain('socket hang up');
        expectNothingSentIn(failure);
    });

    test('leaves the shop client\'s rejection without the proof or the cookie, and with the reason', async ({ page }) => {
        const shopClient = new TestOrders(page.request, `${await deadOrigin()}/rest/main/V1/`, PROOFS);

        for (const failure of [await rejectionOf(shopClient.recognition()), await rejectionOf(shopClient.abandon(CART))]) {
            expect(failure.message).toContain('ECONNREFUSED');
            expectNothingSentIn(failure);
        }
    });

    test('leaves a leftover cart\'s note and failure without the proof or the cookie, and with the reason', async ({ page }) => {
        const carts = new TestOrderCarts(new TestOrders(page.request, `${await deadOrigin()}/rest/main/V1/`, PROOFS));
        const annotations: { type: string; description?: string }[] = [];

        carts.record(CART);

        const failure = await rejectionOf(finishTestOrderRun({ carts }, { annotations }));
        const [note] = annotations.map(annotation => annotation.description ?? '');

        expect(note).toContain('ECONNREFUSED');
        expect(note).not.toMatch(PROOF_SHAPE);
        expect(note).not.toContain(COOKIE);
        expect(note).not.toContain('Call log:');
        expect(failure).toBeInstanceOf(AggregateError);
        expectNothingSentIn(failure);
    });
});
