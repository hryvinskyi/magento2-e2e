import type { BrowserContext, Page, Response } from '@playwright/test';
/**
 * Signs the placement of one guest cart for a shop that recognises test orders. The storefront code
 * knows only that the shop wants headers on the placement; what they hold is the shop's business.
 * It throws when it will not sign this cart, which stops the placement in the browser.
 */
export interface PlacementSigner {
    /** The headers that prove the placement of the guest cart with this masked id. */
    headersFor(maskedCartId: string): Readonly<Record<string, string>>;
}
/** What placing one test order is allowed to send, and how it is signed. */
export interface TestOrderPlacementTerms {
    /** The masked id of the guest cart the test built — the only cart whose placement is signed. */
    readonly cart: string;
    /** The origins of the shop — the only places a signed placement is sent to. */
    readonly shopOrigins: ReadonlySet<string>;
    /**
     * The paths the shop's stores are served below, each starting and ending with `/`. A placement is
     * signed only on the REST API at the web root or below one of these: nothing else on the shop's
     * origin receives a proof.
     */
    readonly storePaths: ReadonlySet<string>;
    readonly signer: PlacementSigner;
    /**
     * Why the shop must not receive this placement, given the JSON body the checkout sent; nothing when
     * it may. A checkout that carries a side effect in the placement, such as a newsletter choice, is
     * stopped here by the project that knows the field.
     */
    readonly refusal?: (body: Readonly<Record<string, unknown>>) => string | undefined;
    /** How long, in milliseconds, the shop may take to answer the placement, and again the way to payment after it; 30 s when unset. */
    readonly deadlineMs?: number;
}
/** A test order the shop accepted, with the browser on its way to payment. */
export interface PlacedTestOrder {
    /** The masked id of the guest cart the order was placed from — what ending the order names. */
    readonly maskedCartId: string;
    /** The order id the shop answered the placement with. */
    readonly orderId: string;
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
 * the test's own guest-cart placement with its proof, or stop it in the browser — and say why.
 */
export type PlacementVerdict = {
    readonly kind: 'pass';
} | {
    readonly kind: 'sign';
    readonly maskedCartId: string;
} | {
    readonly kind: 'refuse';
    readonly reason: string;
};
/**
 * Decides what becomes of a request that could turn a cart into an order. Only one is signed: a `POST`
 * of a guest cart's payment information, sent to the REST API at the web root or below a store's path
 * on one of the shop's own origins, for the very cart the test built, which the project's `refusal`
 * has no reason to stop. Every other write is refused, so a test that believes it places a test order
 * never creates a real one and never hands its proof to another host.
 */
export declare function judgePlacement(request: CaughtRequest, terms: Pick<TestOrderPlacementTerms, 'cart' | 'shopOrigins' | 'storePaths' | 'refusal'>): PlacementVerdict;
/**
 * From now on, signs the one placement `terms` allows with the headers its signer makes, and stops
 * in the browser every other REST and GraphQL placement — another cart, another host, a signed-in
 * customer's cart, the order call, a GraphQL mutation that places or completes an order, a placement
 * the project's `refusal` gives a reason against. The first placement stopped here rejects
 * `placedOrder()`. Placements sent later on the page, a retried click among them, are signed or stopped
 * the same way.
 *
 * The signed placement is sent from here, following no redirect, so its proof reaches the shop and
 * nothing else. `paymentRedirect` is the address the checkout sends the browser to once the order is
 * placed: only the page's own navigation there counts, within the deadline of the terms, so a provider's
 * script, a preload or a frame inside the page at a matching address does not end the wait before the
 * payment session exists.
 */
export declare function signTestOrderPlacements(page: Page, terms: TestOrderPlacementTerms, paymentRedirect: RegExp): Promise<SignedPlacements>;
/**
 * Stops, on every page of the context, each request that could turn a cart into an order and remembers
 * it: a write to any of the REST addresses the signing route watches, and a GraphQL mutation that places
 * or completes an order. Reads and everything else go on to the context's other routes.
 *
 * Playwright asks a page's routes before a context's, so what `signTestOrderPlacements()` signs or
 * stops on the page never arrives here. What does arrive is a placement no signing route saw, which the
 * shop would take for an ordinary order. The caller fails the test on it at its end: the page may
 * swallow the abort.
 */
export declare function stopUnsignedPlacements(context: BrowserContext): Promise<UnsignedPlacements>;
