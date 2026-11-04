import { CART_TAG, TEST_ORDER_TAG, test } from '@hryvinskyi/magento2-e2e';
import type { Page, Storefront } from '@hryvinskyi/magento2-e2e';

test.use({ trace: 'off' });

/** The cart the tests of this file place from; the consumer's runs look for it in the server's log. */
const CART = 'consumer-cart';

/** The tests of a project whose shop refuses the API client, so it gives the run another one. */
const testWithOwnClient = test.extend({
    shopRequests: async ({ playwright }, use) => {
        const client = await playwright.request.newContext({ extraHTTPHeaders: { 'X-Consumer-Client': 'own' } });

        await use(client);
        await client.dispose();
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

testWithOwnClient('a test order goes through the client the project gives', { tag: TEST_ORDER_TAG }, ({ testOrders }) => {
    testOrders.carts.record(CART);
});
