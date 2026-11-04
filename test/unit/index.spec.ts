import { expect, test } from '@playwright/test';
import * as entry from '../../src/index';

test('the public entry exports the project, environment, safety-tag, per-store, module, browser and config functions', () => {
    expect(Object.keys(entry).sort()).toEqual([
        'Arrivals',
        'CART_TAG',
        'ClickReports',
        'DEFAULT_DEVICES',
        'MUTATING_TAG',
        'READONLY_TAG',
        'RequestsInFlight',
        'SEARCH_SERVICE_TAG',
        'Storefront',
        'blockedHosts',
        'clickInside',
        'consentCookie',
        'defineMagentoConfig',
        'defineProject',
        'dismissOnSight',
        'enabledModules',
        'evidence',
        'expect',
        'isMagentoProject',
        'keepsEvidence',
        'loadAmdModule',
        'loadMagentoJQuery',
        'moduleTests',
        'pageModule',
        'perStoreValue',
        'sessionStorageFlag',
        'tabToNextControl',
        'test',
    ]);
});

test('the public entry\'s functions work together', () => {
    const project = entry.defineProject({
        name: 'Acme',
        magentoRoot: '/srv/acme',
        stores: { main: { code: 'main', path: '/', locale: 'en-GB' } },
        defaultStore: 'main',
        environments: { local: { baseUrl: store => `https://shop.test${store.path}` } },
        defaultEnvironment: 'local',
    });
    const environment = project.environment({});

    expect(entry.isMagentoProject(project)).toBe(true);
    expect(environment.baseUrl(project.store('main'))).toBe('https://shop.test/');
    expect(environment.allows([entry.MUTATING_TAG])).toBe(true);
});
