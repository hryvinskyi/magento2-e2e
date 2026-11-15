import path from 'node:path';
import { consentCookie, defineProject } from '@hryvinskyi/magento2-e2e';
import type { EnvironmentDefinition, MagentoProject, Store } from '@hryvinskyi/magento2-e2e';

/** The store views of the shop, by Magento store code. Paths are below the host, with both slashes. */
export const STORES: { readonly en: Store; readonly fr: Store } = {
    en: { code: 'en', path: '/', locale: 'en-GB' },
    fr: { code: 'fr', path: '/fr/', locale: 'fr-FR' },
};

/**
 * The places the tests can run. `E2E_ENV` picks one; `E2E_BASE_URL_<STORE CODE>` replaces one store's
 * address in any of them. The environment marked `production: true` is the live shop: only tests whose
 * safety tag allows production run there.
 */
export const ENVIRONMENTS: {
    readonly local: EnvironmentDefinition;
    readonly staging: EnvironmentDefinition;
    readonly production: EnvironmentDefinition;
} = {
    local: {
        baseUrl: store => `https://shop.test${store.path}`,
        // A local copy usually has a certificate the browser cannot verify.
        ignoreHttpsErrors: true,
        // Where the admin is, for @admin tests: the admin's front name is backend/frontName in app/etc/env.php.
        // adminUrl: () => 'https://shop.test/admin/',
    },
    staging: {
        baseUrl: (store, variables) => `${variables.E2E_STAGING_URL ?? 'https://staging.example.com'}${store.path}`,
        // Accepts E2E_SEARCH_SERVICE=off here, for a staging without a search service.
        searchServiceOptional: true,
    },
    production: {
        baseUrl: store => `https://www.example.com${store.path}`,
        production: true,
        // A live shop is rate limited per address.
        workers: 2,
    },
};

// Narrows StoreCode, RegisteredStore and EnvironmentName to this project's own, everywhere.
declare module '@hryvinskyi/magento2-e2e' {
    interface Register {
        stores: typeof STORES;
        environments: typeof ENVIRONMENTS;
    }
}

export const project: MagentoProject = defineProject({
    name: 'Acme',
    // The Magento installation: the directory that holds app/etc/config.php. This project's e2e/
    // directory sits directly in it.
    magentoRoot: path.resolve(__dirname, '..', '..'),
    stores: STORES,
    defaultStore: 'en',
    environments: ENVIRONMENTS,
    defaultEnvironment: 'local',
    // Records consent before the first page opens, so no consent banner covers it. Replace the
    // cookie's name and value with what the shop's consent banner reads, or delete the line.
    consent: consentCookie('visitor-consent', 'necessary-only'),
    // Gives the project the @admin tag, for tests that sign in to the admin as E2E_ADMIN_USER. An environment
    // with an adminUrl is one they reach; { onProduction: true } would also let them reach the live shop's.
    // admin: {},
});
