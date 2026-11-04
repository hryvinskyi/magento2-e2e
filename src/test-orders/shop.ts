import type { Storefront } from '../storefront/storefront';
import { isRecord, jsonOf, quotedBody, reportableMessageOf, shopReasonIn } from './answers';
import { RECOGNITION_SUBJECT } from './proof';
import type { TestOrderProofs } from './proof';

/** How long the shop may take to answer a recognition probe or to abandon a test order. */
const DEFAULT_DEADLINE_MS = 30_000;

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
    /** A redirect is never followed: it would carry the proof to wherever it points. */
    readonly maxRedirects: 0;
}

/**
 * Sends requests to the shop's REST API. The browser context's request client is one, and carries the
 * context's HTTP credentials and certificate settings with it.
 */
export interface ShopRequests {
    post(url: string, options: ShopRequestOptions): Promise<ShopAnswer>;
}

/** Whether the shop recognises the runner's proofs — and, when it does not, what it answered. */
export type Recognition =
    | { readonly recognised: true }
    | { readonly recognised: false; readonly status: number; readonly reason: string };

/** What abandoning a cart's test orders did: an order left open when there is one, otherwise the newest. */
export interface AbandonedTestOrder {
    /** The order's number; nothing when the shop names none. */
    readonly incrementId: string | null;
    /** The order's state afterwards: `canceled` once it has been cancelled, any other when it could not be. */
    readonly state: string;
    /** Whether every order of the cart was deleted after it was cancelled (the shop's configuration decides). */
    readonly deleted: boolean;
}

/**
 * What the shop did when asked to abandon the test orders of a cart: it ended every one; or an order is
 * past cancelling and stays in the shop in the state it names, which the shop answers as a success; or
 * it has no order placed from that cart — the placement was refused or never sent — so there is nothing
 * to end.
 */
export type Abandonment =
    | { readonly kind: 'abandoned'; readonly order: AbandonedTestOrder }
    | { readonly kind: 'still-open'; readonly order: AbandonedTestOrder }
    | { readonly kind: 'nothing-placed'; readonly reason: string };

/** Ends the test order of a guest cart; what the clean-up after a test needs of the shop. */
export interface TestOrderAbandoner {
    abandon(maskedCartId: string): Promise<Abandonment>;
}

/** An answer of the shop that does not have the shape its API publishes. */
export class TestOrderContractError extends Error {
    public constructor(what: string, body: string) {
        super(`${what}: ${quotedBody(body)}`);
        this.name = 'TestOrderContractError';
    }
}

/** The shop's answer to abandoning when it has no test order placed from the cart. */
const NOTHING_PLACED_STATUS = 404;

/** The state of an order that has ended; in any other the order is still open. */
const CANCELLED_STATE = 'canceled';

/** Reads the shop's answer to abandoning a test order: `{increment_id?, state, deleted}`. */
export function parseAbandonedTestOrder(body: string): AbandonedTestOrder {
    const parsed = jsonOf(body);

    if (!isRecord(parsed) || typeof parsed.state !== 'string' || typeof parsed.deleted !== 'boolean') {
        throw new TestOrderContractError('The shop answered an abandoned test order without its state', body);
    }

    const incrementId = parsed.increment_id;

    if (incrementId !== undefined && incrementId !== null && typeof incrementId !== 'string') {
        throw new TestOrderContractError('The shop answered an abandoned test order with an odd order number', body);
    }

    return { incrementId: incrementId ?? null, state: parsed.state, deleted: parsed.deleted };
}

/**
 * The shop's REST surface for test orders: whether it recognises the runner's proofs, and ending a
 * test order the runner placed. Every request carries a proof made for its action, gives up at a
 * deadline and follows no redirect.
 */
export class TestOrders implements TestOrderAbandoner {
    private readonly requests: ShopRequests;
    private readonly restBase: string;
    private readonly proofs: TestOrderProofs;
    private readonly deadlineMs: number;

    /**
     * @param requests  How requests reach the shop.
     * @param restBase  The store's REST base URL, ending in `V1/`.
     * @param proofs    Makes the proof of each request.
     * @param deadlineMs How long each request may take.
     */
    public constructor(requests: ShopRequests, restBase: string, proofs: TestOrderProofs, deadlineMs: number = DEFAULT_DEADLINE_MS) {
        this.requests = requests;
        this.restBase = restBase;
        this.proofs = proofs;
        this.deadlineMs = deadlineMs;
    }

    /** The test-order surface of one store view, reached through `requests`. */
    public static of(storefront: Pick<Storefront, 'url' | 'store'>, requests: ShopRequests, proofs: TestOrderProofs): TestOrders {
        return new TestOrders(requests, storefront.url(`rest/${storefront.store.code}/V1/`), proofs);
    }

    /**
     * Asks the shop whether it recognises the runner's proofs. Only `200` with the body `true` is a
     * yes; any other answer — a refused proof, a shop that refuses test orders on its live payment
     * keys, a shop without the probe — is a no, with the shop's reason. A runner that is not
     * recognised must not place anything: its order would be an ordinary one, sent to every partner
     * of the shop.
     */
    public async recognition(): Promise<Recognition> {
        const answer = await this.post('test-orders/recognition', this.proofs.headersFor('recognise', RECOGNITION_SUBJECT));
        const body = await answer.text();

        if (answer.status() === 200 && jsonOf(body) === true) {
            return { recognised: true };
        }

        return { recognised: false, status: answer.status(), reason: shopReasonIn(body) };
    }

    /**
     * Ends the test orders placed from a guest cart: the shop cancels each — which takes back what
     * placing it did — and deletes it when it is configured to. A cart with an order past cancelling comes
     * back as `still-open`, with the state it stays in. A cart the shop placed no order from is answered as
     * such, not as a failure: there is nothing to end. Call it only once the shop has
     * sent the browser on to payment, or once the test has given up on that, so no payment session is
     * created for an order already ended.
     */
    public async abandon(maskedCartId: string): Promise<Abandonment> {
        const answer = await this.post(
            `test-orders/${encodeURIComponent(maskedCartId)}/abandon`,
            this.proofs.headersFor('abandon', maskedCartId),
        );
        const body = await answer.text();

        if (answer.status() === NOTHING_PLACED_STATUS) {
            return { kind: 'nothing-placed', reason: shopReasonIn(body) };
        }

        if (answer.status() !== 200) {
            throw new Error(`The shop did not abandon the test order of cart ${maskedCartId} (${String(answer.status())}): ${shopReasonIn(body)}`);
        }

        const order = parseAbandonedTestOrder(body);

        return { kind: order.state === CANCELLED_STATE ? 'abandoned' : 'still-open', order };
    }

    /** Sends one request; a request that fails rejects with a plain error that keeps what was sent out of the report. */
    private async post(path: string, headers: Readonly<Record<string, string>>): Promise<ShopAnswer> {
        try {
            return await this.requests.post(new URL(path, this.restBase).toString(), {
                headers,
                data: {},
                timeout: this.deadlineMs,
                maxRedirects: 0,
            });
        } catch (error) {
            throw new Error(reportableMessageOf(error));
        }
    }
}
