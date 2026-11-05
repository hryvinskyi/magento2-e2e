import { expect, test } from '@playwright/test';
import type { PageGuard } from '../../src/project/project';
import { defineProject, isMagentoProject } from '../../src/project/project';
import { GUEST_PAYMENT_INFORMATION } from '../../src/test-orders/placement';
import type { PlacementRoute } from '../../src/test-orders/placement';
import type { ShopClient } from '../../src/test-orders/shop';
import { ACME_CHECKOUT } from './acme-checkout-route';
import { sampleConfig } from './sample-project';

const localEnvironment = { baseUrl: (): string => 'https://shop.test/' };

test.describe('defineProject refuses a definition that contradicts itself', () => {
    test('a default store that is not one of the stores', () => {
        expect(() => defineProject(sampleConfig({ defaultStore: 'missing' })))
            .toThrow('defaultStore "missing" is not one of the stores (main, second)');
    });

    test('a default environment that is not one of the environments', () => {
        expect(() => defineProject(sampleConfig({ defaultEnvironment: 'missing' })))
            .toThrow('defaultEnvironment "missing" is not one of the environments (local, staging, production)');
    });

    test('a store listed under another key than its code', () => {
        const stores = { main: { code: 'other', path: '/', locale: 'en-GB' } };

        expect(() => defineProject(sampleConfig({ stores })))
            .toThrow('store "main" declares the code "other"');
    });

    for (const path of ['', 'fr/', '/fr', 'fr']) {
        test(`a store path "${path}" without a leading and a trailing slash`, () => {
            const stores = { main: { code: 'main', path, locale: 'en-GB' } };

            expect(() => defineProject(sampleConfig({ stores })))
                .toThrow(`store "main" has the path "${path}"; a store path starts and ends with "/"`);
        });
    }

    test('a production environment that ignores certificate errors', () => {
        const environments = { local: { ...localEnvironment, production: true, ignoreHttpsErrors: true } };

        expect(() => defineProject(sampleConfig({ environments })))
            .toThrow('environment "local" is production and sets ignoreHttpsErrors');
    });

    test('a production environment whose search service may be switched off', () => {
        const environments = { local: { ...localEnvironment, production: true, searchServiceOptional: true } };

        expect(() => defineProject(sampleConfig({ environments })))
            .toThrow('environment "local" is production and sets searchServiceOptional');
    });

    test('a project safety tag that does not start with "@"', () => {
        expect(() => defineProject(sampleConfig({ safetyTags: { order: { onProduction: false } } })))
            .toThrow('the safety tag "order" must start with "@"');
    });

    for (const tag of ['@readonly', '@cart', '@mutating']) {
        test(`a project safety tag that redefines the core tag ${tag}`, () => {
            expect(() => defineProject(sampleConfig({ safetyTags: { [tag]: { onProduction: true } } })))
                .toThrow(`the safety tag "${tag}" is a core tag and cannot be redefined`);
        });
    }

    test('a Magento root that is not absolute', () => {
        expect(() => defineProject(sampleConfig({ magentoRoot: 'srv/acme' })))
            .toThrow('magentoRoot must be an absolute path; got "srv/acme"');
    });

    test('the refusal names the project', () => {
        expect(() => defineProject(sampleConfig({ defaultStore: 'missing' })))
            .toThrow(/^The project "Acme" is not valid: /);
    });
});

test.describe('defineProject refuses placement routes it could not use', () => {
    test('an empty list, which would leave no placement to sign', () => {
        expect(() => defineProject(sampleConfig({ testOrderPlacements: [] })))
            .toThrow('testOrderPlacements names no placement route; leave it out for Magento\'s own checkout');
    });

    test('a route without any of its members', () => {
        const empty: Partial<PlacementRoute> = {};

        expect(() => defineProject(sampleConfig({ testOrderPlacements: [ACME_CHECKOUT, empty as PlacementRoute] })))
            .toThrow('testOrderPlacements[1] has no stopped (a RegExp), cartOf (a function), outcomeOf (a function)');
    });

    test('each missing member, on its own', () => {
        const cartOf = (): undefined => undefined;
        const outcomeOf = (): { kind: 'after-payment' } => ({ kind: 'after-payment' });
        const stopped = /\/place/;
        const cases: readonly { readonly route: Partial<PlacementRoute>; readonly missing: string }[] = [
            { route: { cartOf, outcomeOf }, missing: 'stopped (a RegExp)' },
            { route: { stopped, outcomeOf }, missing: 'cartOf (a function)' },
            { route: { stopped, cartOf }, missing: 'outcomeOf (a function)' },
        ];

        for (const { route, missing } of cases) {
            expect(() => defineProject(sampleConfig({ testOrderPlacements: [route as PlacementRoute] })), missing)
                .toThrow(`testOrderPlacements[0] has no ${missing}.`);
        }
    });
});

test.describe('defineProject refuses a shop client it does not know', () => {
    test('naming the two there are, read as a value as a plain JavaScript project gets past the types', () => {
        const unknownClient: unknown = 'curl';

        expect(() => defineProject(sampleConfig({ shopClient: unknownClient as ShopClient })))
            .toThrow('shopClient must be one of runner, browser; got "curl".');
    });
});

test.describe('a defined project', () => {
    test('sends what a test order sends from the runner unless it says otherwise', () => {
        expect(defineProject(sampleConfig()).shopClient).toBe('runner');
    });

    test('keeps the shop client it names', () => {
        expect(defineProject(sampleConfig({ shopClient: 'browser' })).shopClient).toBe('browser');
        expect(defineProject(sampleConfig({ shopClient: 'runner' })).shopClient).toBe('runner');
    });

    test('places through Magento\'s own checkout unless it declares otherwise', () => {
        expect(defineProject(sampleConfig()).testOrderPlacements).toEqual([GUEST_PAYMENT_INFORMATION]);
    });

    test('keeps the placement routes it declares, in a list nothing can change', () => {
        const { testOrderPlacements } = defineProject(sampleConfig({ testOrderPlacements: [GUEST_PAYMENT_INFORMATION, ACME_CHECKOUT] }));

        expect(testOrderPlacements).toEqual([GUEST_PAYMENT_INFORMATION, ACME_CHECKOUT]);
        expect(Object.isFrozen(testOrderPlacements)).toBe(true);
    });

    test('finds a store by its code', () => {
        const project = defineProject(sampleConfig());

        expect(project.store('second')).toEqual({ code: 'second', path: '/second/', locale: 'fr-FR' });
    });

    test('refuses an unknown store code, naming the known ones', () => {
        const project = defineProject(sampleConfig());

        expect(() => project.store('xx')).toThrow('Unknown store "xx"; the project\'s stores are main, second.');
    });

    test('does not take an inherited property for a store', () => {
        const project = defineProject(sampleConfig());

        expect(() => project.store('toString')).toThrow('Unknown store "toString"');
    });

    test('lists every store', () => {
        const project = defineProject(sampleConfig());

        expect(project.stores().map(store => store.code)).toEqual(['main', 'second']);
    });

    test('lists the core safety tags first, then the project\'s own', () => {
        const project = defineProject(sampleConfig({ safetyTags: { '@order': { onProduction: false } } }));

        expect(project.safetyTags()).toEqual(['@readonly', '@cart', '@mutating', '@order']);
    });

    test('carries the definition\'s settings, with defaults for the absent ones', () => {
        const project = defineProject(sampleConfig());

        expect(project.name).toBe('Acme');
        expect(project.magentoRoot).toBe('/srv/acme');
        expect(project.defaultStore).toBe('main');
        expect(project.pageGuards).toEqual([]);
        expect(project.blockedRequests).toEqual([]);
        expect(project.storefrontBehaviour).toEqual({});
        expect(project.blockServiceWorkers).toBe(false);
    });

    test('carries the storefront behaviour, the guards and the blocked requests it was given', () => {
        const guard: PageGuard = { install: () => Promise.resolve() };
        const consent = { beforeVisit: (): Promise<void> => Promise.resolve() };
        const project = defineProject(sampleConfig({
            consent,
            deferredAssets: { scripts: 'script[type="text/deferred"]' },
            pageGuards: [guard],
            blockedRequests: [/tracker\.example\.com/],
            blockServiceWorkers: true,
        }));

        expect(project.storefrontBehaviour).toEqual({ consent, deferredAssets: { scripts: 'script[type="text/deferred"]' } });
        expect(project.pageGuards).toEqual([guard]);
        expect(project.blockedRequests).toEqual([/tracker\.example\.com/]);
        expect(project.blockServiceWorkers).toBe(true);
    });

    test('is frozen', () => {
        const project = defineProject(sampleConfig());

        expect(Object.isFrozen(project)).toBe(true);
        expect(Object.isFrozen(project.stores())).toBe(true);
        expect(Object.isFrozen(project.pageGuards)).toBe(true);
        expect(Object.isFrozen(project.storefrontBehaviour)).toBe(true);
    });

    test('is not changed by a later change to the definition it was made from', () => {
        const config = sampleConfig();
        const stores = { ...config.stores };
        const project = defineProject({ ...config, stores });

        Object.assign(stores, { late: { code: 'late', path: '/', locale: 'en-GB' } });

        expect(() => project.store('late')).toThrow('Unknown store "late"');
    });

    test('reads the environment from the variables it is given', () => {
        const project = defineProject(sampleConfig());

        expect(project.environment({ E2E_ENV: 'staging' }).name).toBe('staging');
    });
});

test.describe('isMagentoProject', () => {
    test('recognises a project defineProject made', () => {
        expect(isMagentoProject(defineProject(sampleConfig()))).toBe(true);
    });

    test('rejects anything else, even an object of the same shape', () => {
        const project = defineProject(sampleConfig());

        expect(isMagentoProject({ ...project })).toBe(false);
        expect(isMagentoProject(sampleConfig())).toBe(false);
        expect(isMagentoProject(undefined)).toBe(false);
        expect(isMagentoProject(null)).toBe(false);
        expect(isMagentoProject('Acme')).toBe(false);
    });
});
