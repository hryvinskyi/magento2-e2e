"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refuseTrace = refuseTrace;
exports.startTestOrderRun = startTestOrderRun;
exports.finishTestOrderRun = finishTestOrderRun;
exports.describeAbandonment = describeAbandonment;
const answers_1 = require("./answers");
const carts_1 = require("./carts");
const proof_1 = require("./proof");
const shop_1 = require("./shop");
const ABANDONMENT_WORDS = {
    abandoned: (cart, { order }) => `cart ${cart}: test order ${numberOf(order)} abandoned, now ${order.state}${order.deleted ? ' and deleted' : ''}`,
    'still-open': (cart, { order }) => `cart ${cart}: test order ${numberOf(order)} could not be ended and is still ${order.state}`,
    'nothing-placed': (cart, { reason }) => `cart ${cart}: no test order was placed from it, so there was nothing to abandon (${reason})`,
};
/**
 * Refuses a test of test orders that records a trace, whatever the mode: a trace keeps every request
 * header, so it would keep the proofs. Playwright's `trace` option names its mode directly or in an
 * object.
 */
function refuseTrace(trace, title) {
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
async function startTestOrderRun({ storefront, requests, environment, routes, client }) {
    const secret = environment.testOrderSecret();
    if (secret === undefined) {
        throw new Error('A test order is placed only with E2E_TEST_ORDER_SECRET set.');
    }
    const proofs = new proof_1.TestOrderProofs(secret, proof_1.systemClock);
    const shop = shop_1.TestOrders.of(storefront, requests, proofs);
    const carts = new carts_1.TestOrderCarts(shop);
    const recognition = await shop.recognition();
    if (!recognition.recognised) {
        throw new Error(`The shop does not recognise this run's test orders (${String(recognition.status)}): ${recognition.reason} `
            + 'Nothing was placed.');
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
async function finishTestOrderRun(run, testInfo) {
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
function describeAbandonment(cart, abandonment) {
    return wordsFor(ABANDONMENT_WORDS, cart, abandonment);
}
/** The error of a cart that could not be abandoned, holding nothing of what the failed request sent. */
function failureOf(leftover) {
    return leftover.kind === 'failed' ? [new Error((0, answers_1.reportableMessageOf)(leftover.error))] : [];
}
/** The reader's words for a cart whose order the shop could not end. */
function stillOpenOf(leftover) {
    return leftover.kind === 'answered' && leftover.abandonment.kind === 'still-open'
        ? [describeAbandonment(leftover.cart, leftover.abandonment)]
        : [];
}
/** The order's number, or what stands for it when the shop names none. */
function numberOf(order) {
    return order.incrementId ?? '(no number)';
}
/** What became of a cart the test left, in the reader's words. */
function describeLeftover(leftover) {
    if (leftover.kind === 'failed') {
        return `cart ${leftover.cart}: could not be abandoned — ${(0, answers_1.reportableMessageOf)(leftover.error)}`;
    }
    return describeAbandonment(leftover.cart, leftover.abandonment);
}
/** Hands an abandonment to the words of its kind. */
function wordsFor(words, cart, abandonment) {
    return words[abandonment.kind](cart, abandonment);
}
