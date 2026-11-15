import { expect, test } from '@playwright/test';
import { adminRouteOf } from '../../src/admin/admin-route';

const ADMIN = 'https://shop.test/backoffice/';

test.describe('the route of an admin address', () => {
    test('is the path below the admin, without the secret key, its value and the query', () => {
        expect(adminRouteOf(`${ADMIN}catalog/product/edit/id/5/key/0a1b2c/?back=edit`, ADMIN)).toBe('catalog/product/edit/id/5');
        expect(adminRouteOf(`${ADMIN}catalog/product/index/key/0a1b2c/`, ADMIN)).toBe('catalog/product/index');
        expect(adminRouteOf(`${ADMIN}sales/order/view/key/0a1b2c/order_id/7/`, ADMIN)).toBe('sales/order/view/order_id/7');
    });

    test('reads index for a controller or an action the address leaves out, as Magento runs it', () => {
        expect(adminRouteOf(`${ADMIN}catalog/product/`, ADMIN)).toBe('catalog/product/index');
        expect(adminRouteOf(`${ADMIN}catalog`, ADMIN)).toBe('catalog/index/index');
    });

    test('is the same with and without secret keys', () => {
        expect(adminRouteOf(`${ADMIN}admin/dashboard/index/key/f00/`, ADMIN)).toBe(adminRouteOf(`${ADMIN}admin/dashboard/index/`, ADMIN));
    });

    test('is empty for the admin\'s own address, with or without its trailing slash', () => {
        expect(adminRouteOf(ADMIN, ADMIN)).toBe('');
        expect(adminRouteOf('https://shop.test/backoffice', ADMIN)).toBe('');
        expect(adminRouteOf(`${ADMIN}?a=1`, ADMIN)).toBe('');
    });

    test('keeps a parameter whose value is "key", and a front name, controller or action named so', () => {
        expect(adminRouteOf(`${ADMIN}catalog/product/edit/id/key/`, ADMIN)).toBe('catalog/product/edit/id/key');
        expect(adminRouteOf(`${ADMIN}key/key/key/`, ADMIN)).toBe('key/key/key');
    });

    test('is nothing for an address outside the admin', () => {
        expect(adminRouteOf('https://shop.test/backofficer/catalog/', ADMIN)).toBeUndefined();
        expect(adminRouteOf('https://shop.test/', ADMIN)).toBeUndefined();
        expect(adminRouteOf('https://other.test/backoffice/catalog/', ADMIN)).toBeUndefined();
        expect(adminRouteOf('http://shop.test/backoffice/catalog/', ADMIN)).toBeUndefined();
        expect(adminRouteOf('about:blank', ADMIN)).toBeUndefined();
    });

    test('works for an admin at the root of its own host', () => {
        expect(adminRouteOf('https://admin.shop.test/catalog/product/index/key/abc/', 'https://admin.shop.test/')).toBe('catalog/product/index');
    });
});
