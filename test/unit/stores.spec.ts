import { expect, test } from '@playwright/test';
import type { EnvironmentName, RegisteredStore, Store, StoreCode, StoreMap } from '../../src/project/stores';

/**
 * Without a project's declaration the store and environment types are the open ones: any string is a
 * store code and an environment name, and a registered store is a plain `Store`. This spec compiles
 * only while that holds; the narrowing a declaration brings is proven by a consumer project of its own.
 */
test('without a declared project, store codes and environment names are any string', () => {
    const code: StoreCode = 'any-code';
    const environment: EnvironmentName = 'any-environment';
    const store: RegisteredStore = { code, path: '/', locale: 'en-GB' };
    const plain: Store = store;
    const stores: StoreMap = { [code]: plain };

    expect([stores[code]?.code, environment]).toEqual(['any-code', 'any-environment']);
});
