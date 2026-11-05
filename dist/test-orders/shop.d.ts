import type { Storefront } from '../storefront/storefront';
import type { TestOrderProofs } from './proof';
/** Who sends what a test order sends the shop. */
export declare const SHOP_CLIENTS: readonly ["runner", "browser"];
/**
 * - `runner` — Node, through Playwright's API client and `route.fetch()`;
 * - `browser` — the browser, with its session at the shop's firewall.
 */
export type ShopClient = typeof SHOP_CLIENTS[number];
/** An answer of the shop, as much of it as this client reads. */
export interface ShopAnswer {
    status(): number;
    text(): Promise<string>;
}
/** What a request to the shop carries besides its URL. */
export interface ShopRequestOptions {
    readonly headers: Readonly<Record<string, string>>;
    /** The request body; these calls send an empty JSON object. */
    readonly data: Readonly<Record<string, never>>;
    /** Milliseconds before the request is given up. */
    readonly timeout: number;
    /**
     * A redirect is never followed, by any client: it would carry the proof to wherever it points.
     * Playwright's API client reads this value; `BrowserShopRequests` gets the same from the browser
     * with `redirect: 'manual'`.
     */
    readonly maxRedirects: 0;
}
/**
 * Sends requests to the shop's REST API. The browser context's request client is one, and carries the
 * context's HTTP credentials and certificate settings with it; `BrowserShopRequests` is another, for a
 * shop whose firewall answers only a browser.
 */
export interface ShopRequests {
    post(url: string, options: ShopRequestOptions): Promise<ShopAnswer>;
}
/** Whether the shop recognises the runner's proofs — and, when it does not, what it answered. */
export type Recognition = {
    readonly recognised: true;
} | {
    readonly recognised: false;
    readonly status: number;
    readonly reason: string;
};
/** What abandoning a cart's test orders did: an order left open when there is one, otherwise the newest. */
export interface AbandonedTestOrder {
    /** The order's number; nothing when the shop names none. */
    readonly incrementId: string | null;
    /**
     * The order's state afterwards: `canceled` once it has been cancelled, `closed` once it has been paid
     * and refunded, any other when it could not be ended.
     */
    readonly state: string;
    /** Whether every order of the cart was deleted after it ended (the shop's configuration decides). */
    readonly deleted: boolean;
}
/**
 * What the shop did when asked to abandon the test orders of a cart: it ended every one; or it could
 * not end an order, which stays in the shop in the state it names and which the shop answers as a
 * success; or it has no order placed from that cart — the placement was refused or never sent — so
 * there is nothing to end.
 */
export type Abandonment = {
    readonly kind: 'abandoned';
    readonly order: AbandonedTestOrder;
} | {
    readonly kind: 'still-open';
    readonly order: AbandonedTestOrder;
} | {
    readonly kind: 'nothing-placed';
    readonly reason: string;
};
/** Ends the test order of a cart; what the clean-up after a test needs of the shop. */
export interface TestOrderAbandoner {
    abandon(maskedCartId: string): Promise<Abandonment>;
}
/** An answer of the shop that does not have the shape its API publishes. */
export declare class TestOrderContractError extends Error {
    constructor(what: string, body: string);
}
/** Reads the shop's answer to abandoning a test order: `{increment_id?, state, deleted}`. */
export declare function parseAbandonedTestOrder(body: string): AbandonedTestOrder;
/**
 * The shop's REST surface for test orders: whether it recognises the runner's proofs, and ending a
 * test order the runner placed. Every request carries a proof made for its action, gives up at a
 * deadline and follows no redirect.
 */
export declare class TestOrders implements TestOrderAbandoner {
    private readonly requests;
    private readonly restBase;
    private readonly proofs;
    private readonly deadlineMs;
    /**
     * @param requests  How requests reach the shop.
     * @param restBase  The store's REST base URL, ending in `V1/`.
     * @param proofs    Makes the proof of each request.
     * @param deadlineMs How long each request may take.
     */
    constructor(requests: ShopRequests, restBase: string, proofs: TestOrderProofs, deadlineMs?: number);
    /** The test-order surface of one store view, reached through `requests`. */
    static of(storefront: Pick<Storefront, 'url' | 'store'>, requests: ShopRequests, proofs: TestOrderProofs): TestOrders;
    /**
     * Asks the shop whether it recognises the runner's proofs. Only `200` with the body `true` is a
     * yes; any other answer — a refused proof, a shop that refuses test orders on its live payment
     * keys, a shop without the probe — is a no, with the shop's reason. A runner that is not
     * recognised must not place anything: its order would be an ordinary one, sent to every partner
     * of the shop.
     */
    recognition(): Promise<Recognition>;
    /**
     * Ends the test orders placed from a cart: the shop cancels each — which takes back what placing it
     * did — or refunds one already paid, which closes it, and deletes it when it is configured to. A cart
     * with an order the shop could not end comes back as `still-open`, with the state it stays in. A cart
     * the shop placed no order from is answered as such, not as a failure: there is nothing to end. Call
     * it only once the shop has sent the browser on to payment, or once the test has given up on that, so
     * no payment session is created for an order already ended.
     */
    abandon(maskedCartId: string): Promise<Abandonment>;
    /** Sends one request; a request that fails rejects with a plain error that keeps what was sent out of the report. */
    private post;
}
