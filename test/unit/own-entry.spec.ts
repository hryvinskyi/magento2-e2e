import { expect, test } from '@playwright/test';
import { ownEntry } from '../../src/project/own-entry';

test('an own key gives its entry', () => {
    expect(ownEntry({ local: 1, production: 2 }, 'production')).toEqual({ key: 'production', value: 2 });
});

test('a missing key, or one only the prototype has, gives nothing', () => {
    const record: Readonly<Record<string, number>> = { local: 1 };

    expect(ownEntry(record, 'staging')).toBeUndefined();
    expect(ownEntry(record, 'constructor')).toBeUndefined();
    expect(ownEntry(record, 'toString')).toBeUndefined();
});
