import type { PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestType } from '@playwright/test';
import { Admin } from './admin/admin';
import { AdminSession } from './admin/admin-session';
import type { Environment } from './environment/environment';
import type { MagentoProject } from './project/project';
import type { StoreCode } from './project/stores';
import { Storefront } from './storefront/storefront';
import type { TestOrderRun } from './test-orders/run';
import type { ShopRequests } from './test-orders/shop';
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
    /**
     * The shop's admin, on a page of its own context that holds the worker's admin session: the admin's
     * address, the run's admin user, the project's blocked requests and, on a guarded run, the write guard
     * with the admin's origin among the shop's. Only a test tagged `@admin`, in a project that declares
     * `admin`, may ask for it, and only with its trace off: a trace would keep the session cookie.
     */
    admin: Admin;
    /** Enforces the safety tag of every test; never requested by name. */
    safetyGuard: undefined;
    /** Skips a test that needs the search service where it is switched off; never requested by name. */
    searchServiceGuard: undefined;
}
export interface MagentoWorkerFixtures {
    /** The environment this run targets. */
    environment: Environment;
    /**
     * The admin session of this worker: it signs in when the first `admin` fixture of the worker asks for
     * it, never before, and every later test of the worker gets the same session. Tests use `admin`.
     */
    adminSession: AdminSession;
}
/**
 * Playwright's `test`, with the project's stores, environment and protections: every test declares
 * exactly one safety tag and is skipped where that tag may not run, the `context` fixture aborts the
 * project's blocked requests, keeps a guarded run's writes on the shop and stops every order placement
 * of an `@order` test that was not signed, and the `page` fixture installs the project's page guards
 * before the test sees it. A page the test opens in that context has what the context gives it but
 * none of the page guards; a context the test opens itself has nothing of this.
 */
export declare const test: TestType<PlaywrightTestArgs & PlaywrightTestOptions & MagentoTestOptions & MagentoTestFixtures, PlaywrightWorkerArgs & PlaywrightWorkerOptions & MagentoWorkerOptions & MagentoWorkerFixtures>;
export { expect } from '@playwright/test';
/**
 * The Playwright types a test needs, from the same copy of Playwright as `test`: a test shipped in a
 * module sits outside the directory that holds the project's packages, and one entry point keeps
 * every test on the same runner.
 */
export type { APIRequestContext, APIResponse, BrowserContext, Frame, JSHandle, Locator, Page, Request, Response, Route, TestInfo, } from '@playwright/test';
