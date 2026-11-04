import { MUTATING_TAG, READONLY_TAG, test } from '@hryvinskyi/magento2-e2e';

test('a mutating test runs only where writes are allowed', { tag: MUTATING_TAG }, () => {
    test.info().annotations.push({ type: 'ran', description: 'mutating' });
});

test('a test without a safety tag is refused', () => {
    test.info().annotations.push({ type: 'ran', description: 'untagged' });
});

test('a test with two safety tags is refused', { tag: [READONLY_TAG, MUTATING_TAG] }, () => {
    test.info().annotations.push({ type: 'ran', description: 'two tags' });
});
