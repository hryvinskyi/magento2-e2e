import { expect, READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';

test('a linked Composer package\'s test runs', { tag: READONLY_TAG }, ({ environment }) => {
    expect(environment.name).not.toBe('');
});
