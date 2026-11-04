import { expect, test } from '@playwright/test';
import { perStoreValue } from '../../src/stores/per-store-value';

const offersPath = perStoreValue('OFFERS_PATH', { main: 'offers', second: '' });

test('a store\'s recorded value', () => {
    expect(offersPath('main', {})).toBe('offers');
});

test('a setting replaces the recorded value for its store only, trimmed', () => {
    const variables = { E2E_OFFERS_PATH_MAIN: ' catalog/category/view/id/7 ', E2E_OFFERS_PATH_OTHER: 'other' };

    expect(offersPath('main', variables)).toBe('catalog/category/view/id/7');
});

test('a setting gives a value to a store with none recorded', () => {
    expect(offersPath('third', { E2E_OFFERS_PATH_THIRD: 'sale' })).toBe('sale');
});

test('an empty setting leaves the recorded value', () => {
    expect(offersPath('main', { E2E_OFFERS_PATH_MAIN: '  ' })).toBe('offers');
});

test('a store with neither a recorded value nor a setting is refused, naming the table', () => {
    expect(() => offersPath('third', {})).toThrow('No value is recorded for store "third" in OFFERS_PATH — add it there.');
});

test('an empty recorded value counts as none', () => {
    expect(() => offersPath('second', {})).toThrow('No value is recorded for store "second" in OFFERS_PATH');
});

test('the values are taken when the reader is made', () => {
    const values: Record<string, string> = { main: 'offers' };
    const reader = perStoreValue('OFFERS_PATH', values);

    values.main = 'changed';

    expect(reader('main', {})).toBe('offers');
});
