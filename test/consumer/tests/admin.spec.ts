import { ADMIN_TAG, expect, READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';

test.use({ trace: 'off' });

test('an admin test opens the dashboard and a menu item', { tag: ADMIN_TAG }, async ({ admin }) => {
    await admin.open();
    await expect(admin.page.locator('[data-ui-id="menu-magento-backend-dashboard"]')).toBeVisible();

    await admin.openMenuItem('menu-magento-catalog-catalog-products');

    expect(admin.route()).toBe('catalog/product/index');
    expect(await admin.formKey()).toBe('consumer-form-key');
});

test('a second admin test of the worker opens the admin with the same session', { tag: ADMIN_TAG }, async ({ admin }) => {
    await admin.openMenuItem('menu-magento-backend-dashboard');

    expect(admin.route()).toBe('admin/dashboard/index');
});

test('a read-only test may not ask for the admin', { tag: READONLY_TAG }, ({ admin }) => {
    expect(admin.baseUrl).toBe('');
});
