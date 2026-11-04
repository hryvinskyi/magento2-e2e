import { TEST_ORDER_TAG, test } from '@hryvinskyi/magento2-e2e';

test.use({ trace: { mode: 'on' } });

test('an order test with a trace object asks the shop nothing', { tag: TEST_ORDER_TAG }, ({ testOrders }) => {
    testOrders.carts.record('consumer-cart');
});
