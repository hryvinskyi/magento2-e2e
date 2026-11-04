import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signTestOrderPlacements, stopUnsignedPlacements } from '../../src/test-orders/placement';
import type { PlacementSigner, TestOrderPlacementTerms } from '../../src/test-orders/placement';
import { systemClock, TEST_ORDER_PROOF_HEADER, TestOrderProofs } from '../../src/test-orders/proof';
import { finishTestOrderRun } from '../../src/test-orders/run';
import { TestOrderCarts } from '../../src/test-orders/carts';
import { TestOrders } from '../../src/test-orders/shop';
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

const ERROR_PAGE = `<html><body>${'x'.repeat(5_000)}</body></html>`;

const ORDER_ID = '42';
const CHECKOUT = '/checkout';
const PAYMENT = '/payment/start';
const PAYMENT_ADDRESS = /\/payment\/start$/;
const STALLED_PAYMENT = '/payment/stalled';
const ELSEWHERE = '/elsewhere';

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
 * Sends what a checkout sends, from the page: the request, and on an accepted answer the browser on
 * to the payment address. Says the answer's status, or that the request never got one.
 */
async function place(page: Page, url: string, body = PLACEMENT_BODY): Promise<number | 'no answer'> {
    return page.evaluate(async ({ target, payload, payment }) => {
        try {
            const answer = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });

            if (answer.ok) {
                setTimeout(() => { window.location.assign(payment); }, 0);
            }

            return answer.status;
        } catch {
            return 'no answer' as const;
        }
    }, { target: url, payload: body, payment: PAYMENT });
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
            reason: /payment-information call/,
        },
        {
            name: 'a signed-in customer\'s cart below a store\'s path',
            address: () => shop.url('/fr/rest/fr/V1/carts/mine/payment-information'),
            reason: /payment-information call/,
        },
        {
            name: 'a signed-in customer\'s cart without a store code',
            address: () => shop.url('/rest/V1/carts/mine/payment-information'),
            reason: /payment-information call/,
        },
        {
            name: 'the test\'s own cart with a trailing slash',
            address: () => shop.url(`${placementAt('/rest/main/V1', CART)}/`),
            reason: /payment-information call/,
        },
        {
            name: 'the test\'s own cart through the asynchronous API',
            address: () => shop.url(`/rest/main/async/V1/guest-carts/${CART}/payment-information`),
            reason: /payment-information call/,
        },
        {
            name: 'the test\'s own cart through the bulk API',
            address: () => shop.url(`/rest/main/async/bulk/V1/guest-carts/${CART}/payment-information`),
            reason: /payment-information call/,
        },
        {
            name: 'the test\'s own cart through the asynchronous API without a store code',
            address: () => shop.url(`/rest/async/V1/guest-carts/${CART}/payment-information`),
            reason: /payment-information call/,
        },
        {
            name: 'the order call of a guest cart',
            address: () => shop.url(`/rest/main/V1/guest-carts/${CART}/order`),
            reason: /payment-information call/,
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
            reason: /payment-information call/,
        },
        {
            name: 'a placement to another origin',
            address: () => elsewhere.url(placementAt('/rest/main/V1', CART)),
            reason: /not the shop/,
        },
    ];

    for (const { name, address, body, reason } of STOPPED) {
        test(`is stopped in the browser: ${name}`, async ({ page }) => {
            await page.goto(shop.url(CHECKOUT));

            const placements = await signTestOrderPlacements(page, termsOf(), PAYMENT_ADDRESS);

            expect(await place(page, address(), body)).toBe('no answer');
            await expect(placements.placedOrder()).rejects.toThrow(reason);
            placements.stopWatching();

            expect(writesTo(shop)).toEqual([]);
            expect(elsewhere.received).toEqual([]);
        });
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
