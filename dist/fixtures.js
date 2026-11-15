"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expect = exports.test = void 0;
const test_1 = require("@playwright/test");
const admin_1 = require("./admin/admin");
const admin_session_1 = require("./admin/admin-session");
const project_1 = require("./project/project");
const admin_tag_1 = require("./safety/admin-tag");
const safety_tags_1 = require("./safety/safety-tags");
const traces_1 = require("./safety/traces");
const blocked_requests_1 = require("./storefront/blocked-requests");
const fresh_guest_1 = require("./storefront/fresh-guest");
const storefront_1 = require("./storefront/storefront");
const write_guard_1 = require("./storefront/write-guard");
const browser_requests_1 = require("./test-orders/browser-requests");
const placement_1 = require("./test-orders/placement");
const run_1 = require("./test-orders/run");
const SHOP_REQUESTS = {
    runner: ({ page }, use) => use(page.request),
    browser: async ({ context, storefront }, use) => {
        const requests = await browser_requests_1.BrowserShopRequests.open(context, storefront.url());
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
        const unsigned = testInfo.tags.includes(safety_tags_1.TEST_ORDER_TAG)
            ? await (0, placement_1.stopUnsignedPlacements)(context, projectOf(magentoProject).testOrderPlacements)
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
            return new storefront_1.Storefront(page, store, environment.baseUrl(store), project.storefrontBehaviour);
        });
    },
    storefront: async ({ storefrontOf, storeCode, magentoProject }, use) => {
        await use(storefrontOf(storeCode ?? projectOf(magentoProject).defaultStore));
    },
    freshGuest: async ({ storefront }, use) => {
        await use(() => (0, fresh_guest_1.startFreshGuest)(storefront));
    },
    shopRequests: async ({ context, page, storefront, magentoProject }, use) => {
        await SHOP_REQUESTS[projectOf(magentoProject).shopClient]({ context, page, storefront }, use);
    },
    adminSession: [
        async ({ browser, environment }, use) => {
            await use(new admin_session_1.AdminSession(() => (0, admin_session_1.signInToAdmin)(browser, adminTargetOf(environment))));
        },
        { scope: 'worker' },
    ],
    // The checks come before the session is asked for, so a test refused here never reaches the admin;
    // the safety guard has already skipped a test the environment or the run cannot take.
    admin: async ({ browser, adminSession, environment, magentoProject, trace }, use, testInfo) => {
        const project = projectOf(magentoProject);
        (0, admin_tag_1.requireAdminTag)(project.safetyTags(), testInfo.tags, testInfo.title);
        (0, traces_1.refuseTrace)(trace, testInfo.title, 'A trace keeps the admin\'s sign-in and its session cookie');
        const { adminUrl } = adminTargetOf(environment);
        const context = await openAdminContext(browser, await adminSession.storageState());
        await (0, blocked_requests_1.blockRequests)(context, project.blockedRequests);
        if (environment.guardsWrites()) {
            await (0, write_guard_1.keepWritesOnTheShop)(context, new Set([...environment.shopOrigins(), new URL(adminUrl).origin]));
        }
        await use(new admin_1.Admin(await context.newPage(), adminUrl));
        await context.close();
    },
    // A fixture, not a `finally` in the test: Playwright tears a fixture down after a failed and after a
    // timed-out test. It depends on the storefront's page and on the client, so it is torn down before
    // either is, and the last abandon still has the client's page. The safety guard runs first, so a
    // test skipped there never reaches the shop.
    testOrders: async ({ storefront, shopRequests, environment, magentoProject, trace }, use, testInfo) => {
        const project = projectOf(magentoProject);
        (0, safety_tags_1.requireTestOrderTag)(project.safetyTags(), testInfo.tags, testInfo.title);
        (0, run_1.refuseTrace)(trace, testInfo.title);
        const run = await (0, run_1.startTestOrderRun)({
            storefront,
            requests: shopRequests,
            environment,
            routes: project.testOrderPlacements,
            client: project.shopClient,
        });
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
/** Where the admin of the run is and who signs in to it; a run without either is refused, saying which. */
function adminTargetOf(environment) {
    const adminUrl = environment.adminUrl();
    const credentials = environment.adminCredentials();
    if (adminUrl === undefined) {
        throw new Error(`The environment ${environment.name} says nowhere where the admin is: give it an adminUrl.`);
    }
    if (credentials === undefined) {
        throw new Error('The admin is signed in to only with E2E_ADMIN_USER and E2E_ADMIN_PASSWORD set.');
    }
    return { adminUrl, credentials };
}
/** A context of its own for an admin test, opened with the worker's session. */
function openAdminContext(browser, storageState) {
    return browser.newContext({ storageState });
}
/** Fails a test that sent a placement without signing it: the page may have swallowed the aborted request. */
function refuseUnsignedPlacements(unsigned) {
    const stopped = unsigned.stopped();
    if (stopped.length > 0) {
        throw new Error(`An ${safety_tags_1.TEST_ORDER_TAG} test presses pay only after signTestOrderPlacements(); stopped in the browser: ${stopped.join(', ')}.`);
    }
}
