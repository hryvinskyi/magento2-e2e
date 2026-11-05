"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUEST_PAYMENT_INFORMATION = void 0;
exports.judgePlacement = judgePlacement;
exports.signTestOrderPlacements = signTestOrderPlacements;
exports.stopUnsignedPlacements = stopUnsignedPlacements;
const arrivals_1 = require("../arrivals");
const navigation_1 = require("../navigation");
const answers_1 = require("./answers");
const deadline_1 = require("./deadline");
const placement_clients_1 = require("./placement-clients");
const FAILURE_WORDS = {
    refused: ({ reason }) => `The test order placement was stopped in the browser: ${reason}.`,
    unanswered: ({ reason }) => `The test order placement never got an answer: ${reason}`,
    redirected: ({ status, location }) => `The shop redirected the test order placement (${String(status)}), and its proof went with the redirect to ${location}.`,
};
/** How long the shop may take to answer a placement, and to answer the way to payment after it, unless the terms say otherwise. */
const DEFAULT_DEADLINE_MS = 30_000;
/**
 * Magento's own checkout's placement: a guest cart's payment-information call. It decides what
 * receives a proof, so it is anchored at the start of the path. The first group is the
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
/** Why a write that no route names as a placement of a cart is refused. */
const NOT_A_PLACEMENT = 'a test order is placed only by a POST one of the project\'s placement routes names a cart for';
/** What the browser's navigation after an accepted placement is called when it does not come. */
const WAY_TO_PAYMENT = 'The way to payment';
/** Methods that only read; the placement route lets them through untouched. */
const READING_METHODS = new Set(['GET', 'HEAD']);
/** A guest cart's payment-information call: Magento's own checkout. */
exports.GUEST_PAYMENT_INFORMATION = Object.freeze({
    stopped: ANY_REST_PLACEMENT,
    cartOf: (path, _body, storePaths) => {
        const masked = maskedCartOf(path, storePaths);
        return masked === undefined ? undefined : decodedCartOf(masked);
    },
    outcomeOf: (body) => {
        const orderId = (0, answers_1.jsonOf)(body);
        if (typeof orderId !== 'string' && typeof orderId !== 'number') {
            throw new Error(`The shop answered the test order placement without an order id: ${(0, answers_1.quotedBody)(body)}`);
        }
        return { kind: 'placed', orderId: String(orderId) };
    },
});
/** The routes of a project that declares none. */
const OWN_CHECKOUT_ROUTES = [exports.GUEST_PAYMENT_INFORMATION];
/**
 * The order an answered placement names; null when it names none, as a route says for an order that comes
 * after payment, or when the body was lost and there is nothing to ask the route. Throws with the shop's
 * reason, when it has a body to give one, if the shop did not accept the placement.
 */
function orderIdOfAnswer({ route, status, body }) {
    if (status < 200 || status >= 300) {
        const reason = body === null ? '' : `: ${(0, answers_1.shopReasonIn)(body)}`;
        throw new Error(`The shop refused the test order placement (${String(status)})${reason}`);
    }
    if (body === null) {
        return null;
    }
    const outcome = route.outcomeOf(body);
    return outcome.kind === 'placed' ? outcome.orderId : null;
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
/**
 * The addresses to stop writes at, each once: the REST addresses of Magento's own checkout, which stay
 * whatever a project declares, and those of its routes. Each is a copy that keeps no state between two
 * addresses, as a pattern with the `g` or `y` flag would, so that no write slips past one.
 */
function stoppedAddresses(routes) {
    const addresses = new Map();
    for (const { source, flags } of [ANY_REST_PLACEMENT, ...routes.map(route => route.stopped)]) {
        const stateless = flags.replace(/[gy]/g, '');
        addresses.set(`${stateless}/${source}`, new RegExp(source, stateless));
    }
    return [...addresses.values()];
}
/** Whether a request turns a cart into an order through the storefront's GraphQL endpoint. */
function isGraphqlPlacement(request) {
    return request.method() === 'POST' && GRAPHQL_PLACEMENT.test(request.postData() ?? '');
}
/**
 * The verdict on a write. The routes come first, so that nothing a route does not name is taken for a
 * placement, and the project's `refusal` last, so that it is only asked about the test's own placement.
 */
function judgeWrite(method, request, terms) {
    const sent = `the page sent ${method} ${request.url}`;
    if (method !== 'POST') {
        return { kind: 'refuse', reason: `${NOT_A_PLACEMENT}; ${sent}` };
    }
    const url = new URL(request.url);
    const body = (0, answers_1.jsonOf)(request.body ?? '');
    if (!(0, answers_1.isRecord)(body)) {
        return { kind: 'refuse', reason: `${sent}, and its body is not the JSON object a checkout sends` };
    }
    const named = (terms.routes ?? OWN_CHECKOUT_ROUTES).flatMap(route => {
        const maskedCartId = route.cartOf(url.pathname, body, terms.storePaths);
        return maskedCartId === undefined ? [] : [{ route, maskedCartId }];
    });
    const [first] = named;
    if (first === undefined) {
        return { kind: 'refuse', reason: `${NOT_A_PLACEMENT}; ${sent}` };
    }
    if (!terms.shopOrigins.has(url.origin)) {
        return { kind: 'refuse', reason: `the placement went to ${url.origin}, which is not the shop` };
    }
    const own = named.find(({ maskedCartId }) => maskedCartId === terms.cart);
    if (own === undefined) {
        return { kind: 'refuse', reason: `the placement was for cart ${first.maskedCartId}, not for cart ${terms.cart} the test built` };
    }
    const reason = terms.refusal?.(body);
    return reason === undefined ? { kind: 'sign', ...own } : { kind: 'refuse', reason };
}
/**
 * Decides what becomes of a request that could turn a cart into an order. Only one is signed: a `POST`
 * with a JSON object for a body, sent to one of the shop's own origins, for which one of the routes
 * names the very cart the test built, and which the project's `refusal` has no reason to stop. Reads
 * pass. Every other write is refused, so a test that believes it places a test order never creates a
 * real one and never hands its proof to another host. A route or a `refusal` that throws refuses the
 * placement with its message.
 */
function judgePlacement(request, terms) {
    const method = request.method.toUpperCase();
    if (READING_METHODS.has(method)) {
        return { kind: 'pass' };
    }
    try {
        return judgeWrite(method, request, terms);
    }
    catch (error) {
        return { kind: 'refuse', reason: (0, answers_1.reportableMessageOf)(error) };
    }
}
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
async function signTestOrderPlacements(page, terms, paymentRedirect) {
    // A placement on its way counts as arrived, so its own deadline rules from then on, and the wait
    // in `placedOrder()` follows the promise to what became of it.
    const attempts = new arrivals_1.Arrivals();
    const redirects = new arrivals_1.Arrivals();
    const deadlineMs = terms.deadlineMs ?? DEFAULT_DEADLINE_MS;
    // `search()` keeps no state, which a pattern with the `g` flag would between two calls of `test()`.
    const watchRedirect = (request) => {
        if ((0, navigation_1.navigatesThePage)(request, page) && request.url().search(paymentRedirect) !== -1) {
            redirects.add(request);
        }
    };
    const report = (attempt) => {
        attempts.add(attempt);
        terms.awaitingAnswer?.(Promise.resolve(attempt));
    };
    const refuse = async (route, reason) => {
        attempts.add({ kind: 'refused', reason });
        await route.abort('blockedbyclient');
    };
    const sign = async (route, { maskedCartId, route: placement }) => {
        let proof;
        try {
            proof = terms.signer.headersFor(maskedCartId);
        }
        catch (error) {
            await refuse(route, (0, answers_1.reportableMessageOf)(error));
            return;
        }
        await placement_clients_1.PLACEMENT_SENDERS[terms.client ?? 'runner']({ page, route, maskedCartId, placement, proof, deadlineMs, report });
    };
    const handlers = {
        pass: route => route.fallback(),
        sign,
        refuse: (route, verdict) => refuse(route, verdict.reason),
    };
    const judge = async (route) => {
        const request = route.request();
        const verdict = judgePlacement({ method: request.method(), url: request.url(), body: request.postData() }, terms);
        await dispatch(handlers, route, verdict);
    };
    for (const address of stoppedAddresses(terms.routes ?? OWN_CHECKOUT_ROUTES)) {
        await page.route(address, judge);
    }
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
            if (attempt.kind !== 'answered') {
                throw new Error(failureWords(FAILURE_WORDS, attempt));
            }
            const orderId = orderIdOfAnswer(attempt);
            const redirect = await redirects.first(WAY_TO_PAYMENT, deadlineMs);
            const answer = await (0, deadline_1.withinDeadline)(redirect.response(), WAY_TO_PAYMENT, deadlineMs);
            if (answer === null || answer.status() >= 400) {
                const reason = answer === null ? redirect.failure()?.errorText ?? 'no answer' : String(answer.status());
                const order = orderId === null ? 'test order' : `test order ${orderId}`;
                throw new Error(`The shop did not send the ${order} on to payment: ${reason}.`);
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
 * it: a write to any of the addresses the signing route watches, those of `routes` among them, and a
 * GraphQL mutation that places or completes an order. Reads and everything else go on to the context's
 * other routes.
 *
 * Playwright asks a page's routes before a context's, so what `signTestOrderPlacements()` signs or
 * stops on the page never arrives here. What does arrive is a placement no signing route saw, which the
 * shop would take for an ordinary order. The caller fails the test on it at its end: the page may
 * swallow the abort.
 */
async function stopUnsignedPlacements(context, routes = OWN_CHECKOUT_ROUTES) {
    const stopped = [];
    const stop = async (route) => {
        const request = route.request();
        stopped.push(`${request.method()} ${request.url()}`);
        await route.abort('blockedbyclient');
    };
    const stopWrite = async (route) => {
        if (READING_METHODS.has(route.request().method())) {
            await route.fallback();
            return;
        }
        await stop(route);
    };
    for (const address of stoppedAddresses(routes)) {
        await context.route(address, stopWrite);
    }
    await context.route(GRAPHQL, async (route) => {
        if (!isGraphqlPlacement(route.request())) {
            await route.fallback();
            return;
        }
        await stop(route);
    });
    return { stopped: () => [...stopped] };
}
/** Hands a verdict to the handler of its kind. */
function dispatch(handlers, route, verdict) {
    return handlers[verdict.kind](route, verdict);
}
/** What `placedOrder()` says of a failed attempt, in the words of its kind. */
function failureWords(words, attempt) {
    return words[attempt.kind](attempt);
}
