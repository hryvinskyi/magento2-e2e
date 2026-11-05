import type { PlaywrightWorkerOptions, TestInfo } from '@playwright/test';
import type { Environment, OrderReach } from '../environment/environment';
import type { Storefront } from '../storefront/storefront';
import { reportableMessageOf } from './answers';
import { TestOrderCarts } from './carts';
import type { LeftoverCart } from './carts';
import type { PlacementRoute, TestOrderPlacementTerms } from './placement';
import { systemClock, TestOrderProofs } from './proof';
import { TestOrders } from './shop';
import type { AbandonedTestOrder, Abandonment, ShopClient, ShopRequests } from './shop';

type AbandonmentKind = Abandonment['kind'];

type AbandonmentOf<K extends AbandonmentKind> = Extract<Abandonment, { kind: K }>;

/** How the reader is told what became of an order, per kind of abandonment. */
type AbandonmentWords<K extends AbandonmentKind = AbandonmentKind> = {
    readonly [P in K]: (cart: string, abandonment: AbandonmentOf<P>) => string;
};

const ABANDONMENT_WORDS: AbandonmentWords = {
    abandoned: (cart, { order }) => `cart ${cart}: test order ${numberOf(order)} abandoned, now ${order.state}${order.deleted ? ' and deleted' : ''}`,
    'still-open': (cart, { order }) => `cart ${cart}: test order ${numberOf(order)} could not be ended and is still ${order.state}`,
    'nothing-placed': (cart, { reason }) => `cart ${cart}: no test order was placed from it, so there was nothing to abandon (${reason})`,
};

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
    /** The addresses the project's checkouts place a cart at. */
    readonly routes: readonly PlacementRoute[];
    /** Who sends the signed placement. */
    readonly client: ShopClient;
}

/**
 * Refuses a test of test orders that records a trace, whatever the mode: a trace keeps every request
 * header, so it would keep the proofs. Playwright's `trace` option names its mode directly or in an
 * object.
 */
export function refuseTrace(trace: PlaywrightWorkerOptions['trace'], title: string): void {
    const mode = typeof trace === 'string' ? trace : trace.mode;

    if (mode !== 'off') {
        throw new Error(`A trace keeps every proof of a test order, and "${title}" runs with trace ${mode}: add test.use({ trace: 'off' }) to its file.`);
    }
}

/**
 * Starts the test orders of one test, once the shop has said it recognises the run: a runner it does
 * not recognise must not place anything, as its order would be an ordinary one.
 *
 * The origins and paths come from the stores alone: a proof never goes to a partner the write guard
 * lets a run write to.
 */
export async function startTestOrderRun({ storefront, requests, environment, routes, client }: TestOrderRunStart): Promise<TestOrderRun> {
    const secret = environment.testOrderSecret();

    if (secret === undefined) {
        throw new Error('A test order is placed only with E2E_TEST_ORDER_SECRET set.');
    }

    const proofs = new TestOrderProofs(secret, systemClock);
    const shop = TestOrders.of(storefront, requests, proofs);
    const carts = new TestOrderCarts(shop);
    const recognition = await shop.recognition();

    if (!recognition.recognised) {
        throw new Error(
            `The shop does not recognise this run's test orders (${String(recognition.status)}): ${recognition.reason} `
            + 'Nothing was placed.',
        );
    }

    const storeUrls = environment.storeBaseUrls().map(url => new URL(url));
    const shopOrigins = new Set(storeUrls.map(url => url.origin));
    const storePaths = new Set(storeUrls.map(url => url.pathname));

    return {
        proofs,
        shop,
        carts,
        reach: environment.testOrderReach(),
        shopOrigins,
        storePaths,
        placementTerms: (cart, refusal) => ({
            cart,
            shopOrigins,
            storePaths,
            routes,
            client,
            awaitingAnswer: answer => {
                carts.holdCleanUpFor(answer);
            },
            signer: carts.placementSigner(proofs),
            ...(refusal === undefined ? {} : { refusal }),
        }),
    };
}

/**
 * Abandons, after the test, every test order the test did not settle itself, and notes each in the
 * report. It runs after a failed test and after a timed-out one too, as the teardown of a fixture.
 * Every cart is tried; afterwards it fails when any could not be abandoned, and when the shop could not
 * end an order: such an order stays in the shop, and a passed run must not leave one unsaid.
 */
export async function finishTestOrderRun(run: Pick<TestOrderRun, 'carts'>, testInfo: Pick<TestInfo, 'annotations'>): Promise<void> {
    const leftovers = await run.carts.abandonLeftovers();

    for (const leftover of leftovers) {
        testInfo.annotations.push({ type: 'test order left by the test', description: describeLeftover(leftover) });
    }

    const failures = leftovers.flatMap(failureOf);
    const stillOpen = leftovers.flatMap(stillOpenOf);
    const sentences = [
        ...(failures.length > 0
            ? [`${String(failures.length)} test order(s) could not be abandoned after the test; the shop's own clean-up ends them later.`]
            : []),
        ...(stillOpen.length > 0
            ? [`${String(stillOpen.length)} test order(s) stay in the shop, and the shop's own clean-up will not end them: ${stillOpen.join('; ')}.`]
            : []),
    ];

    if (sentences.length > 0) {
        throw new AggregateError([...failures, ...stillOpen.map(order => new Error(order))], sentences.join(' '));
    }
}

/** What abandoning the test order of a cart did, in the reader's words. */
export function describeAbandonment(cart: string, abandonment: Abandonment): string {
    return wordsFor(ABANDONMENT_WORDS, cart, abandonment);
}

/** The error of a cart that could not be abandoned, holding nothing of what the failed request sent. */
function failureOf(leftover: LeftoverCart): readonly Error[] {
    return leftover.kind === 'failed' ? [new Error(reportableMessageOf(leftover.error))] : [];
}

/** The reader's words for a cart whose order the shop could not end. */
function stillOpenOf(leftover: LeftoverCart): readonly string[] {
    return leftover.kind === 'answered' && leftover.abandonment.kind === 'still-open'
        ? [describeAbandonment(leftover.cart, leftover.abandonment)]
        : [];
}

/** The order's number, or what stands for it when the shop names none. */
function numberOf(order: AbandonedTestOrder): string {
    return order.incrementId ?? '(no number)';
}

/** What became of a cart the test left, in the reader's words. */
function describeLeftover(leftover: LeftoverCart): string {
    if (leftover.kind === 'failed') {
        return `cart ${leftover.cart}: could not be abandoned — ${reportableMessageOf(leftover.error)}`;
    }

    return describeAbandonment(leftover.cart, leftover.abandonment);
}

/** Hands an abandonment to the words of its kind. */
function wordsFor<K extends AbandonmentKind>(words: AbandonmentWords<K>, cart: string, abandonment: AbandonmentOf<K>): string {
    return words[abandonment.kind](cart, abandonment);
}
