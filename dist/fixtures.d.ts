import type { PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestType } from '@playwright/test';
import type { Environment } from './environment/environment';
import type { MagentoProject } from './project/project';
import type { StoreCode } from './project/stores';
import { Storefront } from './storefront/storefront';
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
    /** Enforces the safety tag of every test; never requested by name. */
    safetyGuard: undefined;
    /** Skips a test that needs the search service where it is switched off; never requested by name. */
    searchServiceGuard: undefined;
}
export interface MagentoWorkerFixtures {
    /** The environment this run targets. */
    environment: Environment;
}
/**
 * Playwright's `test`, with the project's stores, environment and protections: every test declares
 * exactly one safety tag and is skipped where that tag may not run, the `context` fixture aborts the
 * project's blocked requests and keeps a guarded run's writes on the shop, and the `page` fixture
 * installs the project's page guards before the test sees it. A page the test opens in that context
 * has what the context gives it but none of the page guards; a context the test opens itself has
 * nothing of this.
 */
export declare const test: TestType<PlaywrightTestArgs & PlaywrightTestOptions & MagentoTestOptions & MagentoTestFixtures, PlaywrightWorkerArgs & PlaywrightWorkerOptions & MagentoWorkerOptions & MagentoWorkerFixtures>;
export { expect } from '@playwright/test';
/**
 * The Playwright types a test needs, from the same copy of Playwright as `test`: a test shipped in a
 * module sits outside the directory that holds the project's packages, and one entry point keeps
 * every test on the same runner.
 */
export type { APIRequestContext, APIResponse, BrowserContext, Frame, JSHandle, Locator, Page, Request, Response, Route, TestInfo, } from '@playwright/test';
