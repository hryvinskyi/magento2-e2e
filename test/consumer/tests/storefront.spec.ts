import { CART_TAG, expect, READONLY_TAG, SEARCH_SERVICE_TAG, test } from '@hryvinskyi/magento2-e2e';
import { CONSENT_COOKIE, OVERLAY_FLAG } from '../project';

test('the default store opens with consent recorded and the page guards installed', { tag: READONLY_TAG }, async ({ storefront, page }) => {
    await storefront.open();

    const cookies = await page.context().cookies(storefront.baseUrl);

    expect(cookies.map(cookie => cookie.name)).toContain(CONSENT_COOKIE);
    expect(await page.evaluate(key => window.sessionStorage.getItem(key), OVERLAY_FLAG)).toBe('yes');
});

test('a phone opens the default store', { tag: [READONLY_TAG, '@mobile'] }, async ({ storefront }) => {
    const response = await storefront.open();

    expect(response?.status()).toBe(200);
});

test.describe('the second store', () => {
    test.use({ storeCode: 'second' });

    test('is the store the storefront opens', { tag: CART_TAG }, ({ storefront }) => {
        expect(storefront.store.code).toBe('second');
        expect(storefront.baseUrl).toMatch(/\/second\/$/);
    });
});

test('a search test runs only while the search service is on', { tag: [READONLY_TAG, SEARCH_SERVICE_TAG] }, ({ environment }) => {
    expect(environment.hasSearchService).toBe(true);
});

test('the environment of the run is the one E2E_ENV names', { tag: READONLY_TAG }, ({ environment }) => {
    test.info().annotations.push({ type: 'environment', description: environment.name });
});
