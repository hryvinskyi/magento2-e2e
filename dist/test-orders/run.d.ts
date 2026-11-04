import type { PlaywrightWorkerOptions, TestInfo } from '@playwright/test';
import type { Environment, OrderReach } from '../environment/environment';
import type { Storefront } from '../storefront/storefront';
import { TestOrderCarts } from './carts';
import type { TestOrderPlacementTerms } from './placement';
import { TestOrderProofs } from './proof';
import { TestOrders } from './shop';
import type { Abandonment, ShopRequests } from './shop';
/** Everything the test orders of one test need, and the carts they may have been placed from. */
export interface TestOrderRun {
    readonly proofs: TestOrderProofs;
    readonly shop: TestOrders;
    /** Every cart a test order may have been placed from; whatever the test leaves is abandoned after it. */
    readonly carts: TestOrderCarts;
    /** How far a test order goes in this run; the test honours it, as nothing here knows the payment page. */
    readonly reach: OrderReach;
    /** The origins of the stores here: the only places a proof goes to. */
    readonly shopOrigins: ReadonlySet<string>;
    /** The paths the stores are served below here. */
    readonly storePaths: ReadonlySet<string>;
    /** The terms of one cart's placement; pass the project's `refusal` when its checkout needs one. */
    placementTerms(cart: string, refusal?: TestOrderPlacementTerms['refusal']): TestOrderPlacementTerms;
}
/** What a run of test orders starts from. */
export interface TestOrderRunStart {
    /** The store view the run's test orders are placed in. */
    readonly storefront: Pick<Storefront, 'url' | 'store'>;
    readonly requests: ShopRequests;
    readonly environment: Pick<Environment, 'storeBaseUrls' | 'testOrderReach' | 'testOrderSecret'>;
}
/**
 * Refuses a test of test orders that records a trace, whatever the mode: a trace keeps every request
 * header, so it would keep the proofs. Playwright's `trace` option names its mode directly or in an
 * object.
 */
export declare function refuseTrace(trace: PlaywrightWorkerOptions['trace'], title: string): void;
/**
 * Starts the test orders of one test, once the shop has said it recognises the run: a runner it does
 * not recognise must not place anything, as its order would be an ordinary one.
 *
 * The origins and paths come from the stores alone: a proof never goes to a partner the write guard
 * lets a run write to.
 */
export declare function startTestOrderRun({ storefront, requests, environment }: TestOrderRunStart): Promise<TestOrderRun>;
/**
 * Abandons, after the test, every test order the test did not settle itself, and notes each in the
 * report. It runs after a failed test and after a timed-out one too, as the teardown of a fixture.
 * Every cart is tried; afterwards it fails when any could not be abandoned, and when the shop could not
 * cancel any: such an order stays in the shop, and a passed run must not leave one unsaid.
 */
export declare function finishTestOrderRun(run: Pick<TestOrderRun, 'carts'>, testInfo: Pick<TestInfo, 'annotations'>): Promise<void>;
/** What abandoning the test order of a cart did, in the reader's words. */
export declare function describeAbandonment(cart: string, abandonment: Abandonment): string;
