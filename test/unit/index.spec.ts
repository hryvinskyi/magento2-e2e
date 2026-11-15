import { expect, test } from '@playwright/test';
import * as entry from '../../src/index';

test('the public entry exports the project, environment, safety-tag, admin, per-store, module, browser, test-order and config functions', () => {
    expect(Object.keys(entry).sort()).toEqual([
        'ADMIN_TAG',
        'Admin',
        'AdminSession',
        'Arrivals',
        'BrowserShopRequests',
        'CART_TAG',
        'ClickReports',
        'DEFAULT_DEVICES',
        'GUEST_PAYMENT_INFORMATION',
        'MUTATING_TAG',
        'READONLY_TAG',
        'RECOGNITION_SUBJECT',
        'RequestsInFlight',
        'SEARCH_SERVICE_TAG',
        'Storefront',
        'TEST_ORDER_PROOF_HEADER',
        'TEST_ORDER_TAG',
        'TestOrderCarts',
        'TestOrderContractError',
        'TestOrderProofs',
        'TestOrders',
        'adminRouteOf',
        'blockedHosts',
        'clickInside',
        'consentCookie',
        'defineMagentoConfig',
        'defineProject',
        'describeAbandonment',
        'dismissOnSight',
        'enabledModules',
        'evidence',
        'expect',
        'isMagentoProject',
        'judgePlacement',
        'keepsEvidence',
        'loadAmdModule',
        'loadMagentoJQuery',
        'moduleTests',
        'pageModule',
        'parseAbandonedTestOrder',
        'perStoreValue',
        'sessionStorageFlag',
        'signTestOrderPlacements',
        'signTestOrderProof',
        'systemClock',
        'tabToNextControl',
        'test',
        'testOrderSafetyRule',
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
