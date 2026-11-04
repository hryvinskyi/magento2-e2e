import { expect, READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';
import { BLOCKED_PATH } from '../project';

test('a blocked request never leaves the browser', { tag: READONLY_TAG }, async ({ storefront, page }) => {
    await storefront.open();

    const outcome = await page.evaluate(async path => {
        try {
            await fetch(path);

            return 'answered';
        } catch (error) {
            return error instanceof Error ? error.message : 'refused';
        }
    }, BLOCKED_PATH);

    expect(outcome).not.toBe('answered');
});
