"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestOrders = exports.TestOrderContractError = exports.SHOP_CLIENTS = void 0;
exports.parseAbandonedTestOrder = parseAbandonedTestOrder;
const answers_1 = require("./answers");
const proof_1 = require("./proof");
/** Who sends what a test order sends the shop. */
exports.SHOP_CLIENTS = ['runner', 'browser'];
/** How long the shop may take to answer a recognition probe or to abandon a test order. */
const DEFAULT_DEADLINE_MS = 30_000;
/** An answer of the shop that does not have the shape its API publishes. */
class TestOrderContractError extends Error {
    constructor(what, body) {
        super(`${what}: ${(0, answers_1.quotedBody)(body)}`);
        this.name = 'TestOrderContractError';
    }
}
exports.TestOrderContractError = TestOrderContractError;
/** The shop's answer to abandoning when it has no test order placed from the cart. */
const NOTHING_PLACED_STATUS = 404;
/** The states of an order that has ended; in any other the order is still open. */
const ENDED_STATES = new Set(['canceled', 'closed']);
/** Reads the shop's answer to abandoning a test order: `{increment_id?, state, deleted}`. */
function parseAbandonedTestOrder(body) {
    const parsed = (0, answers_1.jsonOf)(body);
    if (!(0, answers_1.isRecord)(parsed) || typeof parsed.state !== 'string' || typeof parsed.deleted !== 'boolean') {
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
class TestOrders {
    requests;
    restBase;
    proofs;
    deadlineMs;
    /**
     * @param requests  How requests reach the shop.
     * @param restBase  The store's REST base URL, ending in `V1/`.
     * @param proofs    Makes the proof of each request.
     * @param deadlineMs How long each request may take.
     */
    constructor(requests, restBase, proofs, deadlineMs = DEFAULT_DEADLINE_MS) {
        this.requests = requests;
        this.restBase = restBase;
        this.proofs = proofs;
        this.deadlineMs = deadlineMs;
    }
    /** The test-order surface of one store view, reached through `requests`. */
    static of(storefront, requests, proofs) {
        return new TestOrders(requests, storefront.url(`rest/${storefront.store.code}/V1/`), proofs);
    }
    /**
     * Asks the shop whether it recognises the runner's proofs. Only `200` with the body `true` is a
     * yes; any other answer — a refused proof, a shop that refuses test orders on its live payment
     * keys, a shop without the probe — is a no, with the shop's reason. A runner that is not
     * recognised must not place anything: its order would be an ordinary one, sent to every partner
     * of the shop.
     */
    async recognition() {
        const answer = await this.post('test-orders/recognition', this.proofs.headersFor('recognise', proof_1.RECOGNITION_SUBJECT));
        const body = await answer.text();
        if (answer.status() === 200 && (0, answers_1.jsonOf)(body) === true) {
            return { recognised: true };
        }
        return { recognised: false, status: answer.status(), reason: (0, answers_1.shopReasonIn)(body) };
    }
    /**
     * Ends the test orders placed from a cart: the shop cancels each — which takes back what placing it
     * did — or refunds one already paid, which closes it, and deletes it when it is configured to. A cart
     * with an order the shop could not end comes back as `still-open`, with the state it stays in. A cart
     * the shop placed no order from is answered as such, not as a failure: there is nothing to end. Call
     * it only once the shop has sent the browser on to payment, or once the test has given up on that, so
     * no payment session is created for an order already ended.
     */
    async abandon(maskedCartId) {
        const answer = await this.post(`test-orders/${encodeURIComponent(maskedCartId)}/abandon`, this.proofs.headersFor('abandon', maskedCartId));
        const body = await answer.text();
        if (answer.status() === NOTHING_PLACED_STATUS) {
            return { kind: 'nothing-placed', reason: (0, answers_1.shopReasonIn)(body) };
        }
        if (answer.status() !== 200) {
            throw new Error(`The shop did not abandon the test order of cart ${maskedCartId} (${String(answer.status())}): ${(0, answers_1.shopReasonIn)(body)}`);
        }
        const order = parseAbandonedTestOrder(body);
        return { kind: ENDED_STATES.has(order.state) ? 'abandoned' : 'still-open', order };
    }
    /** Sends one request; a request that fails rejects with a plain error that keeps what was sent out of the report. */
    async post(path, headers) {
        try {
            return await this.requests.post(new URL(path, this.restBase).toString(), {
                headers,
                data: {},
                timeout: this.deadlineMs,
                maxRedirects: 0,
            });
        }
        catch (error) {
            throw new Error((0, answers_1.reportableMessageOf)(error));
        }
    }
}
exports.TestOrders = TestOrders;
