import { expect, test } from '@playwright/test';
import type { Environment } from '../../src/environment/environment';
import type { ProjectConfig } from '../../src/project/project';
import { defineProject } from '../../src/project/project';
import type { SafetyTagRule } from '../../src/safety/safety-tags';
import { sampleConfig } from './sample-project';

const orderTag: SafetyTagRule = {
    onProduction: true,
    refusal: environment => (environment.variable('E2E_ORDER_SECRET') === undefined
        ? '@order tests run only with E2E_ORDER_SECRET set'
        : undefined),
};

function environmentOf(variables: Record<string, string>, overrides: Partial<ProjectConfig> = {}): Environment {
    return defineProject(sampleConfig(overrides)).environment(variables);
}

test.describe('the environment of a run', () => {
    test('is the default environment when E2E_ENV is unset or empty', () => {
        expect(environmentOf({}).name).toBe('local');
        expect(environmentOf({ E2E_ENV: '  ' }).name).toBe('local');
    });

    test('is the one E2E_ENV names, trimmed', () => {
        expect(environmentOf({ E2E_ENV: ' production ' }).name).toBe('production');
    });

    test('refuses an unknown name, listing the known ones', () => {
        expect(() => environmentOf({ E2E_ENV: 'prod' }))
            .toThrow('E2E_ENV must be one of local, staging, production; got "prod".');
    });

    test('carries the definition\'s settings', () => {
        const production = environmentOf({ E2E_ENV: 'production' });
        const local = environmentOf({});

        expect(production.isProduction).toBe(true);
        expect(production.workers).toBe(1);
        expect(local.isProduction).toBe(false);
        expect(local.workers).toBeUndefined();
        expect(local.ignoresHttpsErrors).toBe(false);
        expect(environmentOf({}, {
            environments: { local: { baseUrl: () => 'https://shop.test/', ignoreHttpsErrors: true } },
        }).ignoresHttpsErrors).toBe(true);
    });
});

test.describe('base URLs', () => {
    const project = defineProject(sampleConfig());

    test('come from the environment\'s resolver, given the run\'s variables', () => {
        const environment = project.environment({ E2E_LOCAL_HOST: 'acme.test' });

        expect(environment.baseUrl(project.store('second'))).toBe('https://acme.test/second/');
    });

    test('always end with a slash', () => {
        const environment = project.environment({ E2E_ENV: 'staging' });

        expect(environment.baseUrl(project.store('second'))).toBe('https://staging.shop.test/second/');
        expect(environment.baseUrl(project.store('main'))).toBe('https://staging.shop.test/');
    });

    test('are replaced by E2E_BASE_URL_<CODE>, trimmed, with the slash added', () => {
        const environment = project.environment({ E2E_BASE_URL_SECOND: '  https://other.test/fr  ' });

        expect(environment.baseUrl(project.store('second'))).toBe('https://other.test/fr/');
        expect(environment.baseUrl(project.store('main'))).toBe('https://shop.test/');
    });

    test('ignore an empty override', () => {
        const environment = project.environment({ E2E_BASE_URL_MAIN: ' ' });

        expect(environment.baseUrl(project.store('main'))).toBe('https://shop.test/');
    });

    for (const address of ['other.test/fr', 'localhost:8080', 'shop.test:8443/fr']) {
        test(`refuse the override ${address}, which is no http(s) address, naming the setting`, () => {
            const environment = project.environment({ E2E_BASE_URL_SECOND: address });

            expect(() => environment.baseUrl(project.store('second')))
                .toThrow(`E2E_BASE_URL_SECOND must be an absolute http(s) URL; got "${address}".`);
        });
    }
});

test.describe('which tests may run', () => {
    const coreTags = ['@readonly', '@cart', '@mutating'];
    const allowedOnProduction: Readonly<Record<string, boolean>> = { '@readonly': true, '@cart': true, '@mutating': false };

    for (const tag of coreTags) {
        test(`a ${tag} test runs outside production`, () => {
            const environment = environmentOf({});

            expect(environment.refusal([tag])).toBeUndefined();
            expect(environment.allows([tag])).toBe(true);
        });

        test(`a ${tag} test ${allowedOnProduction[tag] === true ? 'runs' : 'never runs'} against production`, () => {
            const environment = environmentOf({ E2E_ENV: 'production' });

            if (allowedOnProduction[tag] === true) {
                expect(environment.refusal([tag])).toBeUndefined();
                expect(environment.allows([tag])).toBe(true);
            } else {
                expect(environment.refusal([tag])).toBe(`${tag} tests never run against production`);
                expect(environment.allows([tag])).toBe(false);
            }
        });
    }

    test('a test without a safety tag runs outside production and never against it', () => {
        expect(environmentOf({}).refusal(['@smoke'])).toBeUndefined();
        expect(environmentOf({ E2E_ENV: 'production' }).refusal(['@smoke']))
            .toBe('a test without a safety tag never runs against production');
        expect(environmentOf({ E2E_ENV: 'production' }).allows([])).toBe(false);
    });

    test('a test with a tag that allows production and one that does not never runs against production', () => {
        const environment = environmentOf({ E2E_ENV: 'production' });

        expect(environment.refusal(['@mutating', '@readonly'])).toBe('@mutating tests never run against production');
        expect(environment.refusal(['@readonly', '@mutating'])).toBe('@mutating tests never run against production');
        expect(environment.allows(['@mutating', '@readonly'])).toBe(false);
    });

    test('a test with two tags that refuse production names the first safety tag of the project', () => {
        const environment = environmentOf(
            { E2E_ENV: 'production' },
            { safetyTags: { '@seeded': { onProduction: false } } },
        );

        expect(environment.refusal(['@seeded', '@mutating'])).toBe('@mutating tests never run against production');
    });

    test('a project tag\'s own refusal applies in every environment', () => {
        const safetyTags = { '@order': orderTag };

        expect(environmentOf({}, { safetyTags }).refusal(['@order']))
            .toBe('@order tests run only with E2E_ORDER_SECRET set');
        expect(environmentOf({ E2E_ENV: 'production' }, { safetyTags }).refusal(['@order']))
            .toBe('@order tests run only with E2E_ORDER_SECRET set');
    });

    test('a project tag allowed on production runs there once its own refusal is lifted', () => {
        const environment = environmentOf({ E2E_ENV: 'production', E2E_ORDER_SECRET: 's3cret' }, { safetyTags: { '@order': orderTag } });

        expect(environment.refusal(['@order'])).toBeUndefined();
    });

    test('a project tag\'s own refusal wins over a tag that would allow the test', () => {
        const environment = environmentOf({}, { safetyTags: { '@order': orderTag } });

        expect(environment.refusal(['@readonly', '@order'])).toBe('@order tests run only with E2E_ORDER_SECRET set');
    });
});

test.describe('the search service switch', () => {
    test('is on by default', () => {
        expect(environmentOf({}).hasSearchService).toBe(true);
    });

    test('reads on and off, in any case and with white space', () => {
        expect(environmentOf({ E2E_ENV: 'staging', E2E_SEARCH_SERVICE: ' OFF ' }).hasSearchService).toBe(false);
        expect(environmentOf({ E2E_ENV: 'staging', E2E_SEARCH_SERVICE: 'On' }).hasSearchService).toBe(true);
    });

    test('refuses any other value', () => {
        expect(() => environmentOf({ E2E_SEARCH_SERVICE: 'no' }))
            .toThrow('E2E_SEARCH_SERVICE must be "on" or "off"; got "no".');
    });

    test('refuses off on an environment whose search service is not optional', () => {
        expect(() => environmentOf({ E2E_SEARCH_SERVICE: 'off' }))
            .toThrow('E2E_SEARCH_SERVICE=off is not accepted on local: there the search service is part of what the run checks. It is accepted on staging.');
        expect(() => environmentOf({ E2E_ENV: 'production', E2E_SEARCH_SERVICE: 'off' }))
            .toThrow('E2E_SEARCH_SERVICE=off is not accepted on production');
    });
});

test.describe('HTTP credentials', () => {
    test('are absent without a user', () => {
        expect(environmentOf({}).httpCredentials()).toBeUndefined();
        expect(environmentOf({ E2E_HTTP_USER: ' ', E2E_HTTP_PASSWORD: 'secret' }).httpCredentials()).toBeUndefined();
    });

    test('carry the trimmed user and the password as given', () => {
        expect(environmentOf({ E2E_HTTP_USER: ' tester ', E2E_HTTP_PASSWORD: ' pass ' }).httpCredentials())
            .toEqual({ username: 'tester', password: ' pass ' });
    });

    test('have an empty password when none is set', () => {
        expect(environmentOf({ E2E_HTTP_USER: 'tester' }).httpCredentials()).toEqual({ username: 'tester', password: '' });
    });
});

test.describe('the user agent suffix', () => {
    /** Placeholders for the precedence rule: neither is a value any shop uses. */
    const projectSuffix = 'project-placeholder';
    const runSuffix = 'run-placeholder';

    test('is empty when neither the run nor the project sets one', () => {
        expect(environmentOf({}).userAgentSuffix()).toBe('');
    });

    test('is the project\'s, trimmed, when the run sets none', () => {
        expect(environmentOf({}, { userAgentSuffix: ` ${projectSuffix} ` }).userAgentSuffix()).toBe(projectSuffix);
        expect(environmentOf({ E2E_USER_AGENT_SUFFIX: '  ' }, { userAgentSuffix: projectSuffix }).userAgentSuffix())
            .toBe(projectSuffix);
    });

    test('is the run\'s, trimmed, over the project\'s', () => {
        expect(environmentOf({ E2E_USER_AGENT_SUFFIX: ` ${runSuffix} ` }, { userAgentSuffix: projectSuffix }).userAgentSuffix())
            .toBe(runSuffix);
    });
});

test.describe('production origins', () => {
    test('are the hosts of the production stores, with and without www, and their subdomains', () => {
        const environment = environmentOf({});

        expect(environment.isProductionOrigin('https://www.example.com/checkout')).toBe(true);
        expect(environment.isProductionOrigin('https://example.com/')).toBe(true);
        expect(environment.isProductionOrigin('https://media.example.com/image.jpg')).toBe(true);
        expect(environment.isProductionOrigin('http://EXAMPLE.com')).toBe(true);
    });

    test('do not take in a foreign host', () => {
        const environment = environmentOf({});

        expect(environment.isProductionOrigin('https://shop.test/')).toBe(false);
        expect(environment.isProductionOrigin('https://notexample.com/')).toBe(false);
        expect(environment.isProductionOrigin('https://example.com.other.test/')).toBe(false);
    });

    test('are none in a project without a production environment', () => {
        const environment = environmentOf({}, {
            environments: { local: { baseUrl: store => `https://www.example.com${store.path}` } },
        });

        expect(environment.isProductionOrigin('https://www.example.com/')).toBe(false);
    });

    test('are not redefined by a base URL override', () => {
        const environment = environmentOf({ E2E_ENV: 'production', E2E_BASE_URL_MAIN: 'https://shop.test/' });

        expect(environment.isProductionOrigin('https://shop.test/')).toBe(false);
        expect(environment.isProductionOrigin('https://www.example.com/')).toBe(true);
    });
});

test.describe('a run that targets production', () => {
    const productionWriteGuard = {};
    const overrides: readonly Readonly<Record<string, string>>[] = [
        { E2E_BASE_URL_SECOND: 'https://www.example.com/second/' },
        { E2E_BASE_URL_MAIN: 'https://example.com/' },
    ];
    const withStagingOnASubdomain: Partial<ProjectConfig> = {
        environments: {
            ...sampleConfig().environments,
            staging: { baseUrl: store => `https://staging.example.com${store.path}` },
        },
        productionWriteGuard,
    };

    test('is one in the environment marked production', () => {
        const environment = environmentOf({ E2E_ENV: 'production' }, { productionWriteGuard });

        expect(environment.targetsProduction()).toBe(true);
        expect(environment.guardsWrites()).toBe(true);
    });

    for (const variables of overrides) {
        test(`is one with a store pointed at a live store's host: ${JSON.stringify(variables)}`, () => {
            expect(environmentOf(variables).targetsProduction()).toBe(true);
            expect(environmentOf(variables, { productionWriteGuard }).guardsWrites()).toBe(true);
        });
    }

    test('ignores a leading www. on the live store\'s side as well', () => {
        const environments = {
            ...sampleConfig().environments,
            production: { baseUrl: () => 'https://example.com/', production: true },
        };

        expect(environmentOf({ E2E_BASE_URL_MAIN: 'https://www.example.com/' }, { environments }).targetsProduction()).toBe(true);
    });

    test('is not one for a local copy', () => {
        const environment = environmentOf({}, { productionWriteGuard });

        expect(environment.targetsProduction()).toBe(false);
        expect(environment.guardsWrites()).toBe(false);
    });

    test('is not one for a staging site on a subdomain of the live shop, which is still a production origin', () => {
        const environment = environmentOf({ E2E_ENV: 'staging' }, withStagingOnASubdomain);

        expect(environment.targetsProduction()).toBe(false);
        expect(environment.guardsWrites()).toBe(false);
        expect(environment.isProductionOrigin('https://staging.example.com/')).toBe(true);
    });

    test('does not depend on the environment: a local run on a subdomain of the live shop is not one', () => {
        const environment = environmentOf({ E2E_BASE_URL_MAIN: 'https://staging.example.com/' }, { productionWriteGuard });

        expect(environment.targetsProduction()).toBe(false);
        expect(environment.guardsWrites()).toBe(false);
    });

    test('keeps the safety rules of production when a local run is pointed at the live shop', () => {
        const environment = environmentOf({ E2E_BASE_URL_MAIN: 'https://www.example.com/' });

        expect(environment.refusal(['@mutating'])).toBe('@mutating tests never run against the live shop');
        expect(environment.allows(['@mutating'])).toBe(false);
        expect(environment.refusal(['@smoke'])).toBe('a test without a safety tag never runs against the live shop');
        expect(environment.allows([])).toBe(false);
        expect(environment.refusal(['@readonly'])).toBeUndefined();
        expect(environment.allows(['@readonly'])).toBe(true);
        expect(environment.refusal(['@cart'])).toBeUndefined();
        expect(environment.allows(['@cart'])).toBe(true);
    });

    test('refuses nothing on a staging site on a subdomain of the live shop', () => {
        expect(environmentOf({ E2E_ENV: 'staging' }, withStagingOnASubdomain).refusal(['@mutating'])).toBeUndefined();
    });
});

test.describe('guarding writes', () => {
    const productionWriteGuard = { allowedOrigins: ['https://pay.example.org/checkout'] };

    test('is off without a write guard, even on production', () => {
        expect(environmentOf({ E2E_ENV: 'production' }).guardsWrites()).toBe(false);
    });

    test('is on for production with a write guard', () => {
        expect(environmentOf({ E2E_ENV: 'production' }, { productionWriteGuard }).guardsWrites()).toBe(true);
    });

    test('is off for a local run with a write guard', () => {
        expect(environmentOf({}, { productionWriteGuard }).guardsWrites()).toBe(false);
    });

    test('is on for a local run with a store pointed at the live shop, when a guard is configured', () => {
        const variables = { E2E_BASE_URL_SECOND: 'https://www.example.com/second/' };

        expect(environmentOf(variables, { productionWriteGuard }).guardsWrites()).toBe(true);
        expect(environmentOf(variables).guardsWrites()).toBe(false);
    });

    test('keeps writes on the stores\' origins here and the allowed ones', () => {
        const environment = environmentOf({ E2E_BASE_URL_SECOND: 'https://second.shop.test:8443/fr/' }, { productionWriteGuard });

        expect([...environment.shopOrigins()])
            .toEqual(['https://shop.test', 'https://second.shop.test:8443', 'https://pay.example.org']);
    });

    test('keeps writes on the stores\' origins alone without allowed origins', () => {
        expect([...environmentOf({ E2E_ENV: 'production' }).shopOrigins()]).toEqual(['https://www.example.com']);
    });
});

test.describe('a project\'s own settings', () => {
    test('are read trimmed, and an empty one reads as unset', () => {
        const environment = environmentOf({ E2E_ORDER_SECRET: ' s3cret ', E2E_EMPTY: '   ' });

        expect(environment.variable('E2E_ORDER_SECRET')).toBe('s3cret');
        expect(environment.variable('E2E_EMPTY')).toBeUndefined();
        expect(environment.variable('E2E_MISSING')).toBeUndefined();
    });
});

test.describe('test orders', () => {
    const allowedOrigins = ['https://pay.example.org/checkout'];
    const paying = { ...sampleConfig().environments, local: { baseUrl: () => 'https://shop.test/', paysTestOrders: true } };

    test('are never paid in production, whatever its definition says', () => {
        const environments = {
            ...sampleConfig().environments,
            production: { baseUrl: () => 'https://www.example.com/', production: true, paysTestOrders: true },
        };

        expect(environmentOf({ E2E_ENV: 'production' }, { environments }).testOrderReach()).toBe('payment-window');
    });

    test('are never paid on a run pointed at the live shop, whatever its environment says', () => {
        expect(environmentOf({ E2E_BASE_URL_MAIN: 'https://www.example.com/' }, { environments: paying }).testOrderReach())
            .toBe('payment-window');
    });

    test('are paid on a staging site on a subdomain of the live shop that says so', () => {
        const environments = {
            ...sampleConfig().environments,
            staging: { baseUrl: () => 'https://staging.example.com/', paysTestOrders: true },
        };
        const environment = environmentOf({ E2E_ENV: 'staging' }, { environments });

        expect(environment.isProductionOrigin('https://staging.example.com/')).toBe(true);
        expect(environment.testOrderReach()).toBe('success-page');
    });

    test('are not paid where the environment does not say so: a local copy may hold live keys', () => {
        expect(environmentOf({}).testOrderReach()).toBe('payment-window');
    });

    test('are signed with E2E_TEST_ORDER_SECRET, trimmed; an empty one reads as unset', () => {
        expect(environmentOf({ E2E_TEST_ORDER_SECRET: ' the-secret ' }).testOrderSecret()).toBe('the-secret');
        expect(environmentOf({ E2E_TEST_ORDER_SECRET: '   ' }).testOrderSecret()).toBeUndefined();
        expect(environmentOf({}).testOrderSecret()).toBeUndefined();
    });

    test('are sent to the stores here and to no origin the write guard allows besides them', () => {
        const environment = environmentOf({ E2E_ENV: 'production' }, { productionWriteGuard: { allowedOrigins } });

        expect(environment.storeBaseUrls()).toEqual(['https://www.example.com/', 'https://www.example.com/second/']);
        expect(environment.shopOrigins()).toContain('https://pay.example.org');
    });

    test('are sent to a store\'s overridden address', () => {
        expect(environmentOf({ E2E_BASE_URL_SECOND: 'https://other.test/fr' }).storeBaseUrls())
            .toEqual(['https://shop.test/', 'https://other.test/fr/']);
    });
});
