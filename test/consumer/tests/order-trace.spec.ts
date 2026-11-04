import { TEST_ORDER_TAG, test } from '@hryvinskyi/magento2-e2e';

test('an order test that keeps the default trace asks the shop nothing', { tag: TEST_ORDER_TAG }, ({ testOrders }) => {
    testOrders.carts.record('consumer-cart');
});
