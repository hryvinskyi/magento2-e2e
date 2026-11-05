import { test as base } from '@playwright/test';
import type {
    BrowserContext,
    Page,
    PlaywrightTestArgs,
    PlaywrightTestOptions,
    PlaywrightWorkerArgs,
    PlaywrightWorkerOptions,
    TestType,
} from '@playwright/test';
import type { Environment } from './environment/environment';
import type { MagentoProject } from './project/project';
import { isMagentoProject } from './project/project';
import type { StoreCode } from './project/stores';
import { declaredSafetyTag, requireTestOrderTag, SEARCH_SERVICE_TAG, TEST_ORDER_TAG } from './safety/safety-tags';
import { blockRequests } from './storefront/blocked-requests';
import { startFreshGuest } from './storefront/fresh-guest';
import { Storefront } from './storefront/storefront';
import { keepWritesOnTheShop } from './storefront/write-guard';
import { BrowserShopRequests } from './test-orders/browser-requests';
import { stopUnsignedPlacements } from './test-orders/placement';
import type { UnsignedPlacements } from './test-orders/placement';
import { finishTestOrderRun, refuseTrace, startTestOrderRun } from './test-orders/run';
import type { TestOrderRun } from './test-orders/run';
import type { ShopClient, ShopRequests } from './test-orders/shop';

/** The options of one test, set in the config's `use` or with `test.use()`. */
export interface MagentoTestOptions {
    /** The store view the `storefront` fixture opens; unset, the project's default store. */
    storeCode: StoreCode | undefined;
}

/** The options of a worker, set by `defineMagentoConfig()`. */
export interface MagentoWorkerOptions {
    /** The project the tests run for. */
    magentoProject: MagentoProject | undefined;
}

export interface MagentoTestFixtures {
    /** The store view `storeCode` selects. */
    storefront: Storefront;
    /** Any other store view on the same page — for rules that compare two stores. */
    storefrontOf: (code: StoreCode) => Storefront;
    /**
     * Starts over as a new guest of the `storefront` store, on the same page and the same guarded
     * context: no cookies, no stored cart, consent recorded again. A test that needs several guests one
     * after another asks for this rather than opening a context of its own, which would have none of
     * the protections the fixtures install.
     */
    freshGuest: () => Promise<void>;
    /**
     * The test orders of this test: the shop has recognised the run, and every cart the test records is
     * abandoned after it unless the test did so itself, also after a failure or a timeout. Only a test
     * tagged `@order`, in a project that registered the tag, may ask for it, and only with its trace off.
     */
    testOrders: TestOrderRun;
    /**
     * How `testOrders` reaches the shop's REST API: the page's request client, which shares the browser
     * context's cookies, HTTP credentials and certificate settings, or with the project's
     * `shopClient: 'browser'` a page of its own in that context. A project with a client of its own
     * overrides it with `test.extend`.
     */
    shopRequests: ShopRequests;
    /** Enforces the safety tag of every test; never requested by name. */
    safetyGuard: undefined;
    /** Skips a test that needs the search service where it is switched off; never requested by name. */
    searchServiceGuard: undefined;
}

export interface MagentoWorkerFixtures {
    /** The environment this run targets. */
    environment: Environment;
}

/** What the `shopRequests` fixture draws on. */
interface ShopRequestsSources {
    readonly context: BrowserContext;
    readonly page: Page;
    readonly storefront: Storefront;
}

/** Hands the test the requests of one client for as long as it needs them. */
type ShopRequestsProvider = (sources: ShopRequestsSources, use: (requests: ShopRequests) => Promise<void>) => Promise<void>;

const SHOP_REQUESTS: Readonly<Record<ShopClient, ShopRequestsProvider>> = {
    runner: ({ page }, use) => use(page.request),
    browser: async ({ context, storefront }, use) => {
        const requests = await BrowserShopRequests.open(context, storefront.url());

        await use(requests);
        await requests.close();
    },
};

/**
 * Playwright's `test`, with the project's stores, environment and protections: every test declares
 * exactly one safety tag and is skipped where that tag may not run, the `context` fixture aborts the
 * project's blocked requests, keeps a guarded run's writes on the shop and stops every order placement
 * of an `@order` test that was not signed, and the `page` fixture installs the project's page guards
 * before the test sees it. A page the test opens in that context has what the context gives it but
 * none of the page guards; a context the test opens itself has nothing of this.
 */
export const test: TestType<
    PlaywrightTestArgs & PlaywrightTestOptions & MagentoTestOptions & MagentoTestFixtures,
    PlaywrightWorkerArgs & PlaywrightWorkerOptions & MagentoWorkerOptions & MagentoWorkerFixtures
> = base.extend<MagentoTestOptions & MagentoTestFixtures, MagentoWorkerOptions & MagentoWorkerFixtures>({
    magentoProject: [undefined, { option: true, scope: 'worker' }],

    storeCode: [undefined, { option: true }],

    environment: [
        async ({ magentoProject }, use) => {
            await use(projectOf(magentoProject).environment());
        },
        { scope: 'worker' },
    ],

    // A plain function, not an option tuple: it keeps the built-in option, so the value configured
    // for `serviceWorkers` reaches it as its parameter. What a service worker sends is never routed,
    // so a run whose writes are guarded blocks them. A `test.use({ serviceWorkers })` in a test file
    // replaces this choice for that file; the context's write route still guards what pages send.
    serviceWorkers: async ({ serviceWorkers, magentoProject, environment }, use) => {
        const block = projectOf(magentoProject).blockServiceWorkers || environment.guardsWrites();

        await use(block ? 'block' : serviceWorkers);
    },

    context: async ({ context, magentoProject, environment }, use, testInfo) => {
        await blockRequests(context, projectOf(magentoProject).blockedRequests);

        if (environment.guardsWrites()) {
            await keepWritesOnTheShop(context, environment.shopOrigins());
        }

        const unsigned = testInfo.tags.includes(TEST_ORDER_TAG)
            ? await stopUnsignedPlacements(context, projectOf(magentoProject).testOrderPlacements)
            : undefined;

        await use(context);

        if (unsigned !== undefined) {
            refuseUnsignedPlacements(unsigned);
        }
    },

    page: async ({ page, magentoProject }, use) => {
        for (const guard of projectOf(magentoProject).pageGuards) {
            await guard.install(page);
        }

        await use(page);
    },

    storefrontOf: async ({ page, magentoProject, environment }, use) => {
        const project = projectOf(magentoProject);

        await use(code => {
            const store = project.store(code);

            return new Storefront(page, store, environment.baseUrl(store), project.storefrontBehaviour);
        });
    },

    storefront: async ({ storefrontOf, storeCode, magentoProject }, use) => {
        await use(storefrontOf(storeCode ?? projectOf(magentoProject).defaultStore));
    },

    freshGuest: async ({ storefront }, use) => {
        await use(() => startFreshGuest(storefront));
    },

    shopRequests: async ({ context, page, storefront, magentoProject }, use) => {
        await SHOP_REQUESTS[projectOf(magentoProject).shopClient]({ context, page, storefront }, use);
    },

    // A fixture, not a `finally` in the test: Playwright tears a fixture down after a failed and after a
    // timed-out test. It depends on the storefront's page and on the client, so it is torn down before
    // either is, and the last abandon still has the client's page. The safety guard runs first, so a
    // test skipped there never reaches the shop.
    testOrders: async ({ storefront, shopRequests, environment, magentoProject, trace }, use, testInfo) => {
        const project = projectOf(magentoProject);

        requireTestOrderTag(project.safetyTags(), testInfo.tags, testInfo.title);
        refuseTrace(trace, testInfo.title);

        const run = await startTestOrderRun({
            storefront,
            requests: shopRequests,
            environment,
            routes: project.testOrderPlacements,
            client: project.shopClient,
        });

        await use(run);
        await finishTestOrderRun(run, testInfo);
    },

    safetyGuard: [
        async ({ magentoProject, environment }, use, testInfo) => {
            declaredSafetyTag(projectOf(magentoProject).safetyTags(), testInfo.tags, testInfo.title);

            const refusal = environment.refusal(testInfo.tags);

            testInfo.skip(refusal !== undefined, refusal);
            await use(undefined);
        },
        { auto: true },
    ],

    searchServiceGuard: [
        async ({ environment }, use, testInfo) => {
            testInfo.skip(
                testInfo.tags.includes(SEARCH_SERVICE_TAG) && !environment.hasSearchService,
                `the search service is switched off on ${environment.name} (E2E_SEARCH_SERVICE=off)`,
            );
            await use(undefined);
        },
        { auto: true },
    ],
});

export { expect } from '@playwright/test';

/**
 * The Playwright types a test needs, from the same copy of Playwright as `test`: a test shipped in a
 * module sits outside the directory that holds the project's packages, and one entry point keeps
 * every test on the same runner.
 */
export type {
    APIRequestContext,
    APIResponse,
    BrowserContext,
    Frame,
    JSHandle,
    Locator,
    Page,
    Request,
    Response,
    Route,
    TestInfo,
} from '@playwright/test';

/** The project the config handed to the worker; a run without one is refused with how to give it one. */
function projectOf(value: MagentoProject | undefined): MagentoProject {
    if (!isMagentoProject(value)) {
        throw new Error('The tests run without a Magento project: build the Playwright config with defineMagentoConfig()');
    }

    return value;
}

/** Fails a test that sent a placement without signing it: the page may have swallowed the aborted request. */
function refuseUnsignedPlacements(unsigned: UnsignedPlacements): void {
    const stopped = unsigned.stopped();

    if (stopped.length > 0) {
        throw new Error(
            `An ${TEST_ORDER_TAG} test presses pay only after signTestOrderPlacements(); stopped in the browser: ${stopped.join(', ')}.`,
        );
    }
}
