import { ADMIN_TAG, expect, test } from '@hryvinskyi/magento2-e2e';

test('an admin test that keeps the default trace never signs in', { tag: ADMIN_TAG }, ({ admin }) => {
    expect(admin.baseUrl).toBe('');
});
