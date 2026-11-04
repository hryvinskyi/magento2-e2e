"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgePlacement = judgePlacement;
exports.signTestOrderPlacements = signTestOrderPlacements;
exports.stopUnsignedPlacements = stopUnsignedPlacements;
const arrivals_1 = require("../arrivals");
const navigation_1 = require("../navigation");
const answers_1 = require("./answers");
/** How long the shop may take to answer a placement, and to answer the way to payment after it, unless the terms say otherwise. */
const DEFAULT_DEADLINE_MS = 30_000;
/**
 * The one order placement a test order may go through: a guest cart's payment-information call. It
 * decides what receives a proof, so it is anchored at the start of the path. The first group is the
 * path before `rest/`, the second the masked cart id. The store code may be absent and is never `V1`, nor
 * `async`: the shop queues that address for a consumer that holds no proof, so its order would be ordinary.
 */
const GUEST_PLACEMENT = /^(\/(?:[^/]+\/)*?)rest\/(?:(?!V1\/|async\/)[^/]+\/)?V1\/guest-carts\/([^/?]+)\/payment-information$/;
/**
 * Every REST call that can turn a cart into an order, a guest's or a signed-in customer's, with or
 * without a store code, below any path, queued through the asynchronous or bulk API, or with the
 * trailing slashes Magento ignores. It decides what is stopped, so it stays broad.
 */
const ANY_REST_PLACEMENT = /\/rest\/(?:[^/]+\/){0,3}V1\/(guest-carts|carts)\/[^/]+\/(payment-information|order)\/*(\?|$)/;
/** The storefront's GraphQL endpoint, where a cart can be turned into an order too. */
const GRAPHQL = /\/graphql(\/|\?|$)/;
/**
 * What a GraphQL mutation that turns a cart into an order says in its body, however it spells it: placing
 * the order, setting the payment method and placing it in one call, or completing it through a payment
 * service. It decides what is stopped, so it stays broad.
 */
const GRAPHQL_PLACEMENT = /placeorder|completeorder/i;
/** What the browser's navigation after an accepted placement is called when it does not come. */
const WAY_TO_PAYMENT = 'The way to payment';
/** Methods that only read; the placement route lets them through untouched. */
const READING_METHODS = new Set(['GET', 'HEAD']);
/** The order id the shop answered an accepted placement with; throws with the shop's reason when it did not accept it. */
function placedOrderIdOf(status, body) {
    if (status < 200 || status >= 300) {
        throw new Error(`The shop refused the test order placement (${String(status)}): ${(0, answers_1.shopReasonIn)(body)}`);
    }
    const orderId = (0, answers_1.jsonOf)(body);
    if (typeof orderId !== 'string' && typeof orderId !== 'number') {
        throw new Error(`The shop answered the test order placement without an order id: ${(0, answers_1.quotedBody)(body)}`);
    }
    return String(orderId);
}
/**
 * The masked cart id of a guest cart's placement at this path, on the REST API at the web root or
 * below a store's path; nothing for any other path.
 */
function maskedCartOf(path, storePaths) {
    const [, storePath, masked] = GUEST_PLACEMENT.exec(path) ?? [];
    return storePath === '/' || (storePath !== undefined && storePaths.has(storePath)) ? masked : undefined;
}
/** The masked cart id an address names; nothing when its escapes are malformed. */
function decodedCartOf(masked) {
    try {
        return decodeURIComponent(masked);
    }
    catch {
        return undefined;
    }
}
/** Whether a request turns a cart into an order through the storefront's GraphQL endpoint. */
function isGraphqlPlacement(request) {
    return request.method() === 'POST' && GRAPHQL_PLACEMENT.test(request.postData() ?? '');
}
/** The project's reason to stop a placement with this body, if it has one; one that throws stops it with its message. */
function refusalOf(refusal, body) {
    try {
        return refusal?.(body);
    }
    catch (error) {
        return (0, answers_1.reportableMessageOf)(error);
    }
}
/**
 * Decides what becomes of a request that could turn a cart into an order. Only one is signed: a `POST`
 * of a guest cart's payment information, sent to the REST API at the web root or below a store's path
 * on one of the shop's own origins, for the very cart the test built, which the project's `refusal`
 * has no reason to stop. Every other write is refused, so a test that believes it places a test order
 * never creates a real one and never hands its proof to another host.
 */
function judgePlacement(request, terms) {
    const method = request.method.toUpperCase();
    if (READING_METHODS.has(method)) {
        return { kind: 'pass' };
    }
    const url = new URL(request.url);
    const masked = method === 'POST' ? maskedCartOf(url.pathname, terms.storePaths) : undefined;
    if (masked === undefined) {
        return {
            kind: 'refuse',
            reason: 'a test order is placed only through a guest cart\'s payment-information call; '
                + `the page sent ${method} ${request.url}`,
        };
    }
    if (!terms.shopOrigins.has(url.origin)) {
        return { kind: 'refuse', reason: `the placement went to ${url.origin}, which is not the shop` };
    }
    const maskedCartId = decodedCartOf(masked);
    if (maskedCartId === undefined) {
        return { kind: 'refuse', reason: `the cart in ${request.url} cannot be read` };
    }
    if (maskedCartId !== terms.cart) {
        return { kind: 'refuse', reason: `the placement was for cart ${maskedCartId}, not for cart ${terms.cart} the test built` };
    }
    const body = (0, answers_1.jsonOf)(request.body ?? '');
    if (!(0, answers_1.isRecord)(body)) {
        return { kind: 'refuse', reason: 'the placement\'s body is not the JSON object the checkout sends' };
    }
    const reason = refusalOf(terms.refusal, body);
    return reason === undefined ? { kind: 'sign', maskedCartId } : { kind: 'refuse', reason };
}
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
async function signTestOrderPlacements(page, terms, paymentRedirect) {
    const attempts = new arrivals_1.Arrivals();
    const redirects = new arrivals_1.Arrivals();
    const deadlineMs = terms.deadlineMs ?? DEFAULT_DEADLINE_MS;
    // `search()` keeps no state, which a pattern with the `g` flag would between two calls of `test()`.
    const watchRedirect = (request) => {
        if ((0, navigation_1.navigatesThePage)(request, page) && request.url().search(paymentRedirect) !== -1) {
            redirects.add(request);
        }
    };
    const refuse = async (route, reason) => {
        attempts.add({ kind: 'refused', reason });
        await route.abort('blockedbyclient');
    };
    const sign = async (route, maskedCartId) => {
        const request = route.request();
        let proof;
        try {
            proof = terms.signer.headersFor(maskedCartId);
        }
        catch (error) {
            await refuse(route, (0, answers_1.reportableMessageOf)(error));
            return;
        }
        // Sent from here rather than let through, so the shop's answer is read before the checkout
        // navigates away to payment and takes the answer's body with it.
        try {
            const answer = await route.fetch({
                headers: { ...request.headers(), ...proof },
                timeout: deadlineMs,
                maxRedirects: 0,
            });
            const body = await answer.text();
            attempts.add({ kind: 'answered', maskedCartId, status: answer.status(), body });
            await route.fulfill({ response: answer, body });
        }
        catch (error) {
            attempts.add({ kind: 'unanswered', reason: (0, answers_1.reportableMessageOf)(error) });
            await route.abort('failed');
        }
    };
    const handlers = {
        pass: route => route.fallback(),
        sign: (route, verdict) => sign(route, verdict.maskedCartId),
        refuse: (route, verdict) => refuse(route, verdict.reason),
    };
    await page.route(ANY_REST_PLACEMENT, async (route) => {
        const request = route.request();
        const verdict = judgePlacement({ method: request.method(), url: request.url(), body: request.postData() }, terms);
        await dispatch(handlers, route, verdict);
    });
    await page.route(GRAPHQL, async (route) => {
        const request = route.request();
        if (!isGraphqlPlacement(request)) {
            await route.fallback();
            return;
        }
        await refuse(route, `a GraphQL order placement to ${request.url()}`);
    });
    page.on('request', watchRedirect);
    return {
        placedOrder: async () => {
            const attempt = await attempts.first('The test order placement', deadlineMs);
            if (attempt.kind === 'refused') {
                throw new Error(`The test order placement was stopped in the browser: ${attempt.reason}.`);
            }
            if (attempt.kind === 'unanswered') {
                throw new Error(`The test order placement never got an answer: ${attempt.reason}`);
            }
            const orderId = placedOrderIdOf(attempt.status, attempt.body);
            const redirect = await redirects.first(WAY_TO_PAYMENT, deadlineMs);
            const answer = await withinDeadline(redirect.response(), WAY_TO_PAYMENT, deadlineMs);
            if (answer === null || answer.status() >= 400) {
                const reason = answer === null ? redirect.failure()?.errorText ?? 'no answer' : String(answer.status());
                throw new Error(`The shop did not send the test order ${orderId} on to payment: ${reason}.`);
            }
            return { maskedCartId: attempt.maskedCartId, orderId, paymentRedirect: answer };
        },
        stopWatching: () => {
            page.off('request', watchRedirect);
        },
    };
}
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
async function stopUnsignedPlacements(context) {
    const stopped = [];
    const stop = async (route) => {
        const request = route.request();
        stopped.push(`${request.method()} ${request.url()}`);
        await route.abort('blockedbyclient');
    };
    await context.route(ANY_REST_PLACEMENT, async (route) => {
        if (READING_METHODS.has(route.request().method())) {
            await route.fallback();
            return;
        }
        await stop(route);
    });
    await context.route(GRAPHQL, async (route) => {
        if (!isGraphqlPlacement(route.request())) {
            await route.fallback();
            return;
        }
        await stop(route);
    });
    return { stopped: () => [...stopped] };
}
/** Waits for `waiting`, and rejects naming `what` when it has not settled within `deadlineMs`; the timer keeps no process alive. */
async function withinDeadline(waiting, what, deadlineMs) {
    let timer;
    const deadline = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${what}: nothing arrived within ${String(deadlineMs / 1_000)} s.`));
        }, deadlineMs);
        timer.unref();
    });
    try {
        return await Promise.race([waiting, deadline]);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Hands a verdict to the handler of its kind. */
function dispatch(handlers, route, verdict) {
    return handlers[verdict.kind](route, verdict);
}
