import { CART_TAG, expect, signTestOrderPlacements, TEST_ORDER_TAG, test } from '@hryvinskyi/magento2-e2e';
import type { Page, Storefront } from '@hryvinskyi/magento2-e2e';
import { OWN_CHECKOUT_PLACEMENT } from '../project';

test.use({ trace: 'off' });

/** The cart the tests of this file place from; the consumer's runs look for it in the server's log. */
const CART = 'consumer-cart';

/** Where the browser goes after the project's second checkout accepted a placement. */
const PAYMENT = '/acme-payment';

/** The page the REST calls are sent from, when the browser sends them. */
const QUIET_PAGE = '/robots.txt';

/** The tests of a project whose shop refuses the API client, so it gives the run another one. */
const testWithOwnClient = test.extend({
    shopRequests: async ({ playwright }, use) => {
        const client = await playwright.request.newContext({ extraHTTPHeaders: { 'X-Consumer-Client': 'own' } });

        await use(client);
        await client.dispose();
    },
});

/** The tests of a project that goes through the browser: one fails when the page of its REST calls outlives it. */
const testAfterTheBrowsersClient = test.extend({
    context: async ({ context }, use) => {
        await use(context);

        const open = context.pages().filter(page => page.url().endsWith(QUIET_PAGE));

        if (open.length > 0) {
            throw new Error(`The page of the REST calls is still open after the test: ${open.map(page => page.url()).join(', ')}.`);
        }
    },
});

/** Posts a guest cart's placement from the page, as a checkout would, and swallows whatever becomes of it. */
async function postPlacement(storefront: Storefront, page: Page): Promise<void> {
    await storefront.open();
    await page.evaluate(async address => {
        try {
            await fetch(address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        } catch {
            // A checkout may swallow the failure as well, which is why the test still has to fail.
        }
    }, storefront.url(`rest/main/V1/guest-carts/${CART}/payment-information`));
}

/** Posts the placement of the project's second checkout, as that checkout would, and swallows whatever becomes of it. */
async function postDeclaredPlacement(storefront: Storefront, page: Page): Promise<void> {
    await storefront.open();
    await page.evaluate(async ({ address, cart }) => {
        try {
            await fetch(address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartId: cart }) });
        } catch {
            // A checkout may swallow the failure as well, which is why the test still has to fail.
        }
    }, { address: storefront.url(OWN_CHECKOUT_PLACEMENT.slice(1)), cart: CART });
}

test('a test order the test leaves is abandoned after it', { tag: TEST_ORDER_TAG }, ({ testOrders }) => {
    testOrders.carts.record(CART);
});

test('a cart test may not ask for test orders', { tag: CART_TAG }, ({ testOrders }) => {
    testOrders.carts.record(CART);
});

test('an order test that does not sign places nothing', { tag: TEST_ORDER_TAG }, async ({ storefront, page }) => {
    await postPlacement(storefront, page);
});

test('a cart test is not stopped at a placement', { tag: CART_TAG }, async ({ storefront, page }) => {
    await postPlacement(storefront, page);
});

test('an order test that does not sign a declared placement places nothing', { tag: TEST_ORDER_TAG }, async ({ storefront, page }) => {
    await postDeclaredPlacement(storefront, page);
});

test('a cart test is not stopped at a declared placement', { tag: CART_TAG }, async ({ storefront, page }) => {
    await postDeclaredPlacement(storefront, page);
});

test('an order test signs the placement the project declares', { tag: TEST_ORDER_TAG }, async ({ storefront, page, testOrders }) => {
    await storefront.open();
    testOrders.carts.record(CART);

    const placements = await signTestOrderPlacements(page, testOrders.placementTerms(CART), new RegExp(`${PAYMENT}$`));

    await postDeclaredPlacement(storefront, page);
    await page.goto(storefront.url(PAYMENT.slice(1)));

    const placed = await placements.placedOrder();

    placements.stopWatching();
    expect(placed.orderId).toBeNull();
});

testWithOwnClient('a test order goes through the client the project gives', { tag: TEST_ORDER_TAG }, ({ testOrders }) => {
    testOrders.carts.record(CART);
});

testAfterTheBrowsersClient('a test order goes through the browser', { tag: TEST_ORDER_TAG }, ({ context, testOrders }) => {
    testOrders.carts.record(CART);
    expect(context.pages().map(page => new URL(page.url()).pathname)).toContain(QUIET_PAGE);
});
