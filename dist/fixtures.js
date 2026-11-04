"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expect = exports.test = void 0;
const test_1 = require("@playwright/test");
const project_1 = require("./project/project");
const safety_tags_1 = require("./safety/safety-tags");
const blocked_requests_1 = require("./storefront/blocked-requests");
const fresh_guest_1 = require("./storefront/fresh-guest");
const storefront_1 = require("./storefront/storefront");
const write_guard_1 = require("./storefront/write-guard");
const placement_1 = require("./test-orders/placement");
const run_1 = require("./test-orders/run");
/**
 * Playwright's `test`, with the project's stores, environment and protections: every test declares
 * exactly one safety tag and is skipped where that tag may not run, the `context` fixture aborts the
 * project's blocked requests, keeps a guarded run's writes on the shop and stops every order placement
 * of an `@order` test that was not signed, and the `page` fixture installs the project's page guards
 * before the test sees it. A page the test opens in that context has what the context gives it but
 * none of the page guards; a context the test opens itself has nothing of this.
 */
exports.test = test_1.test.extend({
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
        await (0, blocked_requests_1.blockRequests)(context, projectOf(magentoProject).blockedRequests);
        if (environment.guardsWrites()) {
            await (0, write_guard_1.keepWritesOnTheShop)(context, environment.shopOrigins());
        }
        const unsigned = testInfo.tags.includes(safety_tags_1.TEST_ORDER_TAG) ? await (0, placement_1.stopUnsignedPlacements)(context) : undefined;
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
            return new storefront_1.Storefront(page, store, environment.baseUrl(store), project.storefrontBehaviour);
        });
    },
    storefront: async ({ storefrontOf, storeCode, magentoProject }, use) => {
        await use(storefrontOf(storeCode ?? projectOf(magentoProject).defaultStore));
    },
    freshGuest: async ({ storefront }, use) => {
        await use(() => (0, fresh_guest_1.startFreshGuest)(storefront));
    },
    shopRequests: async ({ page }, use) => {
        await use(page.request);
    },
    // A fixture, not a `finally` in the test: Playwright tears a fixture down after a failed and after a
    // timed-out test. It depends on the storefront's page and on the client, so it is torn down before
    // either is. The safety guard runs first, so a test skipped there never reaches the shop.
    testOrders: async ({ storefront, shopRequests, environment, magentoProject, trace }, use, testInfo) => {
        (0, safety_tags_1.requireTestOrderTag)(projectOf(magentoProject).safetyTags(), testInfo.tags, testInfo.title);
        (0, run_1.refuseTrace)(trace, testInfo.title);
        const run = await (0, run_1.startTestOrderRun)({ storefront, requests: shopRequests, environment });
        await use(run);
        await (0, run_1.finishTestOrderRun)(run, testInfo);
    },
    safetyGuard: [
        async ({ magentoProject, environment }, use, testInfo) => {
            (0, safety_tags_1.declaredSafetyTag)(projectOf(magentoProject).safetyTags(), testInfo.tags, testInfo.title);
            const refusal = environment.refusal(testInfo.tags);
            testInfo.skip(refusal !== undefined, refusal);
            await use(undefined);
        },
        { auto: true },
    ],
    searchServiceGuard: [
        async ({ environment }, use, testInfo) => {
            testInfo.skip(testInfo.tags.includes(safety_tags_1.SEARCH_SERVICE_TAG) && !environment.hasSearchService, `the search service is switched off on ${environment.name} (E2E_SEARCH_SERVICE=off)`);
            await use(undefined);
        },
        { auto: true },
    ],
});
var test_2 = require("@playwright/test");
Object.defineProperty(exports, "expect", { enumerable: true, get: function () { return test_2.expect; } });
/** The project the config handed to the worker; a run without one is refused with how to give it one. */
function projectOf(value) {
    if (!(0, project_1.isMagentoProject)(value)) {
        throw new Error('The tests run without a Magento project: build the Playwright config with defineMagentoConfig()');
    }
    return value;
}
/** Fails a test that sent a placement without signing it: the page may have swallowed the aborted request. */
function refuseUnsignedPlacements(unsigned) {
    const stopped = unsigned.stopped();
    if (stopped.length > 0) {
        throw new Error(`An ${safety_tags_1.TEST_ORDER_TAG} test presses pay only after signTestOrderPlacements(); stopped in the browser: ${stopped.join(', ')}.`);
    }
}
