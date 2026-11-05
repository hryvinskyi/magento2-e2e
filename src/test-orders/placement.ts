import type { BrowserContext, Page, Request, Response, Route } from '@playwright/test';
import { Arrivals } from '../arrivals';
import { navigatesThePage } from '../navigation';
import { isRecord, jsonOf, quotedBody, reportableMessageOf, shopReasonIn } from './answers';
import { withinDeadline } from './deadline';
import { PLACEMENT_SENDERS } from './placement-clients';
import type { AnsweredPlacement, PlacementAttempt } from './placement-clients';
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
export type PlacementOutcome =
    | { readonly kind: 'placed'; readonly orderId: string }
    | { readonly kind: 'after-payment' };

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
export type PlacementVerdict =
    | { readonly kind: 'pass' }
    | { readonly kind: 'sign'; readonly maskedCartId: string; readonly route: PlacementRoute }
    | { readonly kind: 'refuse'; readonly reason: string };

type VerdictKind = PlacementVerdict['kind'];

type VerdictOf<K extends VerdictKind> = Extract<PlacementVerdict, { kind: K }>;

/** What is done with a request, per kind of verdict. */
type VerdictHandlers<K extends VerdictKind = VerdictKind> = {
    readonly [P in K]: (route: Route, verdict: VerdictOf<P>) => Promise<void>;
};

/** An attempt that did not end in an answer of the shop. */
type FailedAttempt = Exclude<PlacementAttempt, AnsweredPlacement>;

type FailedKind = FailedAttempt['kind'];

/** What `placedOrder()` says of an attempt, per kind of failure. */
type FailureWords<K extends FailedKind = FailedKind> = {
    readonly [P in K]: (attempt: Extract<FailedAttempt, { kind: P }>) => string;
};

const FAILURE_WORDS: FailureWords = {
    refused: ({ reason }) => `The test order placement was stopped in the browser: ${reason}.`,
    unanswered: ({ reason }) => `The test order placement never got an answer: ${reason}`,
    redirected: ({ status, location }) =>
        `The shop redirected the test order placement (${String(status)}), and its proof went with the redirect to ${location}.`,
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
const READING_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/** A guest cart's payment-information call: Magento's own checkout. */
export const GUEST_PAYMENT_INFORMATION: PlacementRoute = Object.freeze({
    stopped: ANY_REST_PLACEMENT,
    cartOf: (path: string, _body: Readonly<Record<string, unknown>>, storePaths: ReadonlySet<string>): string | undefined => {
        const masked = maskedCartOf(path, storePaths);

        return masked === undefined ? undefined : decodedCartOf(masked);
    },
    outcomeOf: (body: string): PlacementOutcome => {
        const orderId = jsonOf(body);

        if (typeof orderId !== 'string' && typeof orderId !== 'number') {
            throw new Error(`The shop answered the test order placement without an order id: ${quotedBody(body)}`);
        }

        return { kind: 'placed', orderId: String(orderId) };
    },
});

/** The routes of a project that declares none. */
const OWN_CHECKOUT_ROUTES: readonly PlacementRoute[] = [GUEST_PAYMENT_INFORMATION];

/**
 * The order an answered placement names; null when it names none, as a route says for an order that comes
 * after payment, or when the body was lost and there is nothing to ask the route. Throws with the shop's
 * reason, when it has a body to give one, if the shop did not accept the placement.
 */
function orderIdOfAnswer({ route, status, body }: AnsweredPlacement): string | null {
    if (status < 200 || status >= 300) {
        const reason = body === null ? '' : `: ${shopReasonIn(body)}`;

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
function maskedCartOf(path: string, storePaths: ReadonlySet<string>): string | undefined {
    const [, storePath, masked] = GUEST_PLACEMENT.exec(path) ?? [];

    return storePath === '/' || (storePath !== undefined && storePaths.has(storePath)) ? masked : undefined;
}

/** The masked cart id an address names; nothing when its escapes are malformed. */
function decodedCartOf(masked: string): string | undefined {
    try {
        return decodeURIComponent(masked);
    } catch {
        return undefined;
    }
}

/**
 * The addresses to stop writes at, each once: the REST addresses of Magento's own checkout, which stay
 * whatever a project declares, and those of its routes. Each is a copy that keeps no state between two
 * addresses, as a pattern with the `g` or `y` flag would, so that no write slips past one.
 */
function stoppedAddresses(routes: readonly PlacementRoute[]): readonly RegExp[] {
    const addresses = new Map<string, RegExp>();

    for (const { source, flags } of [ANY_REST_PLACEMENT, ...routes.map(route => route.stopped)]) {
        const stateless = flags.replace(/[gy]/g, '');

        addresses.set(`${stateless}/${source}`, new RegExp(source, stateless));
    }

    return [...addresses.values()];
}

/** Whether a request turns a cart into an order through the storefront's GraphQL endpoint. */
function isGraphqlPlacement(request: Request): boolean {
    return request.method() === 'POST' && GRAPHQL_PLACEMENT.test(request.postData() ?? '');
}

/** What `judgePlacement()` needs of the terms. */
type JudgingTerms = Pick<TestOrderPlacementTerms, 'cart' | 'shopOrigins' | 'storePaths' | 'routes' | 'refusal'>;

/**
 * The verdict on a write. The routes come first, so that nothing a route does not name is taken for a
 * placement, and the project's `refusal` last, so that it is only asked about the test's own placement.
 */
function judgeWrite(method: string, request: CaughtRequest, terms: JudgingTerms): PlacementVerdict {
    const sent = `the page sent ${method} ${request.url}`;

    if (method !== 'POST') {
        return { kind: 'refuse', reason: `${NOT_A_PLACEMENT}; ${sent}` };
    }

    const url = new URL(request.url);
    const body = jsonOf(request.body ?? '');

    if (!isRecord(body)) {
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
export function judgePlacement(request: CaughtRequest, terms: JudgingTerms): PlacementVerdict {
    const method = request.method.toUpperCase();

    if (READING_METHODS.has(method)) {
        return { kind: 'pass' };
    }

    try {
        return judgeWrite(method, request, terms);
    } catch (error) {
        return { kind: 'refuse', reason: reportableMessageOf(error) };
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
export async function signTestOrderPlacements(
    page: Page,
    terms: TestOrderPlacementTerms,
    paymentRedirect: RegExp,
): Promise<SignedPlacements> {
    // A placement on its way counts as arrived, so its own deadline rules from then on, and the wait
    // in `placedOrder()` follows the promise to what became of it.
    const attempts = new Arrivals<PlacementAttempt | Promise<PlacementAttempt>>();
    const redirects = new Arrivals<Request>();
    const deadlineMs = terms.deadlineMs ?? DEFAULT_DEADLINE_MS;
    // `search()` keeps no state, which a pattern with the `g` flag would between two calls of `test()`.
    const watchRedirect = (request: Request): void => {
        if (navigatesThePage(request, page) && request.url().search(paymentRedirect) !== -1) {
            redirects.add(request);
        }
    };
    const report = (attempt: PlacementAttempt | Promise<PlacementAttempt>): void => {
        attempts.add(attempt);
        terms.awaitingAnswer?.(Promise.resolve(attempt));
    };
    const refuse = async (route: Route, reason: string): Promise<void> => {
        attempts.add({ kind: 'refused', reason });
        await route.abort('blockedbyclient');
    };
    const sign = async (route: Route, { maskedCartId, route: placement }: VerdictOf<'sign'>): Promise<void> => {
        let proof: Readonly<Record<string, string>>;

        try {
            proof = terms.signer.headersFor(maskedCartId);
        } catch (error) {
            await refuse(route, reportableMessageOf(error));

            return;
        }

        await PLACEMENT_SENDERS[terms.client ?? 'runner']({ page, route, maskedCartId, placement, proof, deadlineMs, report });
    };
    const handlers: VerdictHandlers = {
        pass: route => route.fallback(),
        sign,
        refuse: (route, verdict) => refuse(route, verdict.reason),
    };

    const judge = async (route: Route): Promise<void> => {
        const request = route.request();
        const verdict = judgePlacement({ method: request.method(), url: request.url(), body: request.postData() }, terms);

        await dispatch(handlers, route, verdict);
    };

    for (const address of stoppedAddresses(terms.routes ?? OWN_CHECKOUT_ROUTES)) {
        await page.route(address, judge);
    }

    await page.route(GRAPHQL, async route => {
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
            const answer = await withinDeadline(redirect.response(), WAY_TO_PAYMENT, deadlineMs);

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
export async function stopUnsignedPlacements(
    context: BrowserContext,
    routes: readonly PlacementRoute[] = OWN_CHECKOUT_ROUTES,
): Promise<UnsignedPlacements> {
    const stopped: string[] = [];
    const stop = async (route: Route): Promise<void> => {
        const request = route.request();

        stopped.push(`${request.method()} ${request.url()}`);
        await route.abort('blockedbyclient');
    };

    const stopWrite = async (route: Route): Promise<void> => {
        if (READING_METHODS.has(route.request().method())) {
            await route.fallback();

            return;
        }

        await stop(route);
    };

    for (const address of stoppedAddresses(routes)) {
        await context.route(address, stopWrite);
    }

    await context.route(GRAPHQL, async route => {
        if (!isGraphqlPlacement(route.request())) {
            await route.fallback();

            return;
        }

        await stop(route);
    });

    return { stopped: () => [...stopped] };
}

/** Hands a verdict to the handler of its kind. */
function dispatch<K extends VerdictKind>(handlers: VerdictHandlers<K>, route: Route, verdict: VerdictOf<K>): Promise<void> {
    return handlers[verdict.kind](route, verdict);
}

/** What `placedOrder()` says of a failed attempt, in the words of its kind. */
function failureWords<K extends FailedKind>(words: FailureWords<K>, attempt: Extract<FailedAttempt, { kind: K }>): string {
    return words[attempt.kind](attempt);
}
