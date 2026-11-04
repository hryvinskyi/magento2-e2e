import { READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';

/**
 * The other name of the page server: the store is on one of `localhost` and `127.0.0.1`, so the
 * other one is a foreign origin served by the same server.
 */
function otherOrigin(baseUrl: string): string {
    const url = new URL(baseUrl);

    url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';

    return url.origin;
}

test('writes leave the browser only where the run allows them', { tag: READONLY_TAG }, async ({ storefront, page, serviceWorkers }) => {
    test.info().annotations.push({ type: 'serviceWorkers', description: serviceWorkers });

    await storefront.open();

    const own = storefront.url('write-probe/own');
    const foreign = `${otherOrigin(storefront.baseUrl)}/write-probe/foreign`;
    const sent = await page.evaluate(async targets => Promise.all(targets.map(async target => {
        try {
            await fetch(target, { method: 'POST', mode: 'no-cors', body: 'probe' });

            return `${target} sent`;
        } catch {
            return `${target} refused`;
        }
    })), [own, foreign]);

    test.info().annotations.push(...sent.map(description => ({ type: 'write', description })));
});
