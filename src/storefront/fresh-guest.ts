import type { Storefront } from './storefront';

/**
 * Starts over as a new guest of a store, on the page and context the test already has. A guest's cart
 * lives in the session cookie and in the browser's storage, so both are emptied: the cookies first, so
 * that nothing the store is asked for afterwards belongs to the old session; then the storage of the
 * store's origin, which only a page of that origin can reach; then the store is opened once more, so
 * nothing it read from the old storage survives. Opening goes through `Storefront.open()`, which
 * records the visitor's consent again before the first request.
 */
export async function startFreshGuest(storefront: Storefront): Promise<void> {
    await storefront.page.context().clearCookies();
    await storefront.open();
    await storefront.page.evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
    await storefront.open();
}
