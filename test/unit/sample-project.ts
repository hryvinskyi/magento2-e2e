import type { ProjectConfig } from '../../src/project/project';

/**
 * A valid project definition the unit specs vary: two stores on one host, a local copy, a staging
 * server whose search service may be switched off, and the live shop.
 */
export function sampleConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
    return {
        name: 'Acme',
        magentoRoot: '/srv/acme',
        stores: {
            main: { code: 'main', path: '/', locale: 'en-GB' },
            second: { code: 'second', path: '/second/', locale: 'fr-FR' },
        },
        defaultStore: 'main',
        environments: {
            local: { baseUrl: (store, variables) => `https://${variables.E2E_LOCAL_HOST ?? 'shop.test'}${store.path}` },
            staging: {
                baseUrl: store => `https://staging.shop.test${store.path.replace(/\/$/, '')}`,
                searchServiceOptional: true,
                workers: 2,
            },
            production: { baseUrl: store => `https://www.example.com${store.path}`, production: true, workers: 1 },
        },
        defaultEnvironment: 'local',
        ...overrides,
    };
}
