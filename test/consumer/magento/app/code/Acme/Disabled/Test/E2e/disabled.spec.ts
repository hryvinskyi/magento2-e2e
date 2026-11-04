import { READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';

test('a disabled module\'s test never runs', { tag: READONLY_TAG }, () => {
    throw new Error('The tests of a disabled module were collected.');
});
