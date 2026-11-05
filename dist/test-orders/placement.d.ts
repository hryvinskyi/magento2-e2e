import type { BrowserContext, Page, Response } from '@playwright/test';
import type { ShopClient } from './shop';
/**
 * Signs the placement of one cart for a shop that recognises test orders. The storefront code knows
 * only that the shop wants headers on the placement; what they hold is the shop's business. It throws
 * when it will not sign this cart, which stops the placement in the browser.
 */
export interface PlacementSigner {
    /** The headers that prove the placement of the cart with this masked id. */
    headersFor(maskedCartId: string): Readonly<Record<string, string>>;
}
/** What an accepted placement says. */
export type PlacementOutcome = {
    readonly kind: 'placed';
    readonly orderId: string;
} | {
    readonly kind: 'after-payment';
};
/**
 * One address a checkout turns a cart into an order at. A project declares the routes of its checkouts,
 * and the package knows no checkout but Magento's own. A placement is always a `POST`.
 */
export interface PlacementRoute {
    /** Every spelling of the address, for stopping it. It decides what is stopped, so it stays broad. */
    readonly stopped: RegExp;
    /**
     * The cart a write to this path places, at the web root or below a store's path; nothing when it is
     * not this route's placement. It decides what receives a proof, so it is anchored.
     */
    cartOf(path: string, body: Readonly<Record<string, unknown>>, storePaths: ReadonlySet<string>): string | undefined;
    /** What the shop's accepted answer says; throws when the answer is not what the route publishes. */
    outcomeOf(body: string): PlacementOutcome;
}
/** What placing one test order is allowed to send, and how it is signed. */
export interface TestOrderPlacementTerms {
    /** The masked id of the cart the test built — the only cart whose placement is signed. */
    readonly cart: string;
    /** The origins of the shop — the only places a signed placement is sent to. */
    readonly shopOrigins: ReadonlySet<string>;
    /**
     * The paths the shop's stores are served below, each starting and ending with `/`. A placement is
     * signed only at the web root or below one of these: nothing else on the shop's origin receives a
     * proof.
     */
    readonly storePaths: ReadonlySet<string>;
    readonly signer: PlacementSigner;
    /** The addresses a cart may be placed at; a guest cart's payment-information call when unset. */
    readonly routes?: readonly PlacementRoute[];
    /**
     * Why the shop must not receive this placement, given the JSON body the checkout sent; nothing when
     * it may. A checkout that carries a side effect in the placement, such as a newsletter choice, is
     * stopped here by the project that knows the field.
     */
    readonly refusal?: (body: Readonly<Record<string, unknown>>) => string | undefined;
    /** How long, in milliseconds, the shop may take to answer the placement, and again the way to payment after it; 30 s when unset. */
    readonly deadlineMs?: number;
    /**
     * Who sends the signed placement; `'runner'` when unset.
     *
     * `'runner'` sends it from Node with `route.fetch()`, follows no redirect and hands the browser the
     * answer. `'browser'` lets the browser's own request go with the proof added, with its session at the
     * shop's firewall, for a shop that answers nothing else. That gives up two things. A redirect is
     * followed, and the proof goes with it: `placedOrder()` then fails and says so. A redirect's hop is
     * neither routed nor judged. The answer's body can be lost when the checkout leaves the page first:
     * a 2xx status then resolves `placedOrder()` with `orderId` null, without asking the route.
     *
     * With either client, a placement past its deadline cannot be called back. The runner drops its
     * connection and the browser's request stays in flight, and the shop may go on to place the order after
     * the clean-up after the test was answered `nothing-placed`; the shop's own clean-up ends such an order.
     */
    readonly client?: ShopClient;
    /**
     * Told of the wait for what became of each signed placement, a promise that never rejects, so that
     * the clean-up after the test can wait for the shop's answer before it asks the shop to end the order.
     */
    readonly awaitingAnswer?: (answer: Promise<unknown>) => void;
}
/** A test order the shop accepted, with the browser on its way to payment. */
export interface PlacedTestOrder {
    /** The masked id of the cart the order was placed from — what ending the order names. */
    readonly maskedCartId: string;
    /**
     * The order id the shop answered the placement with; null when the shop creates the order only after
     * payment, or when the browser sent the placement and the page left before its answer could be read.
     */
    readonly orderId: string | null;
    /**
     * The shop's answer to the browser's way to payment. The provider's payment session exists by the
     * time it has arrived, so ending the order after it leaves no session behind.
     */
    readonly paymentRedirect: Response;
}
/** The placements of one page, signed or stopped, and the way to payment that follows them. */
export interface SignedPlacements {
    /**
     * Resolves once the first placement has been accepted and the shop has answered the browser's way
     * to payment; rejects with the reason when the placement was stopped, refused or never answered.
     */
    placedOrder(): Promise<PlacedTestOrder>;
    /** Stops watching for the way to payment. Placements stay signed or stopped for the page's lifetime. */
    stopWatching(): void;
}
/** The placements of a test that nobody signed, each stopped in the browser. */
export interface UnsignedPlacements {
    /** The method and address of every placement stopped so far, oldest first. */
    stopped(): readonly string[];
}
/** What a request the placement route caught is, as far as it goes. */
export interface CaughtRequest {
    readonly method: string;
    readonly url: string;
    /** The request body as sent; nothing when it has none. */
    readonly body: string | null;
}
/**
 * What to do with a request that could turn a cart into an order: let a read through untouched, send
 * the test's own placement with its proof, naming the route that will read the shop's answer, or stop
 * it in the browser — and say why.
 */
export type PlacementVerdict = {
    readonly kind: 'pass';
} | {
    readonly kind: 'sign';
    readonly maskedCartId: string;
    readonly route: PlacementRoute;
} | {
    readonly kind: 'refuse';
    readonly reason: string;
};
/** A guest cart's payment-information call: Magento's own checkout. */
export declare const GUEST_PAYMENT_INFORMATION: PlacementRoute;
/** What `judgePlacement()` needs of the terms. */
type JudgingTerms = Pick<TestOrderPlacementTerms, 'cart' | 'shopOrigins' | 'storePaths' | 'routes' | 'refusal'>;
/**
 * Decides what becomes of a request that could turn a cart into an order. Only one is signed: a `POST`
 * with a JSON object for a body, sent to one of the shop's own origins, for which one of the routes
 * names the very cart the test built, and which the project's `refusal` has no reason to stop. Reads
 * pass. Every other write is refused, so a test that believes it places a test order never creates a
 * real one and never hands its proof to another host. A route or a `refusal` that throws refuses the
 * placement with its message.
 */
export declare function judgePlacement(request: CaughtRequest, terms: JudgingTerms): PlacementVerdict;
/**
 * From now on, signs the one placement `terms` allows with the headers its signer makes, and stops
 * in the browser every other placement — another cart, another host, the order call, any other write
 * to a route's address, a GraphQL mutation that places or completes an order, a placement the project's
 * `refusal` gives a reason against. The first placement stopped here rejects `placedOrder()`. Placements
 * sent later on the page, a retried click among them, are signed or stopped the same way.
 *
 * With the `'runner'` client the signed placement is sent from here, following no redirect, so its proof
 * reaches the shop and nothing else. With `'browser'` it is the browser's own request, which follows a
 * redirect with the proof still on it: `client` in the terms says what that gives up. `paymentRedirect`
 * is the address the checkout sends the browser to once the order is placed: only the page's own
 * navigation there counts, within the deadline of the terms, so a provider's script, a preload or a frame
 * inside the page at a matching address does not end the wait before the payment session exists.
 */
export declare function signTestOrderPlacements(page: Page, terms: TestOrderPlacementTerms, paymentRedirect: RegExp): Promise<SignedPlacements>;
/**
 * Stops, on every page of the context, each request that could turn a cart into an order and remembers
 * it: a write to any of the addresses the signing route watches, those of `routes` among them, and a
 * GraphQL mutation that places or completes an order. Reads and everything else go on to the context's
 * other routes.
 *
 * Playwright asks a page's routes before a context's, so what `signTestOrderPlacements()` signs or
 * stops on the page never arrives here. What does arrive is a placement no signing route saw, which the
 * shop would take for an ordinary order. The caller fails the test on it at its end: the page may
 * swallow the abort.
 */
export declare function stopUnsignedPlacements(context: BrowserContext, routes?: readonly PlacementRoute[]): Promise<UnsignedPlacements>;
export {};
