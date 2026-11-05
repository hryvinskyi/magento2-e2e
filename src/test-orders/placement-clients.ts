import type { Page, Request, Response, Route } from '@playwright/test';
import { reportableMessageOf } from './answers';
import { withinDeadline } from './deadline';
import type { PlacementRoute } from './placement';
import type { ShopClient } from './shop';

/** What the shop answered a signed placement, with the route that reads it. */
export interface AnsweredPlacement {
    readonly kind: 'answered';
    readonly maskedCartId: string;
    readonly route: PlacementRoute;
    readonly status: number;
    /** The answer's body; null when the page left before it could be read. */
    readonly body: string | null;
}

/** What the page sent when it tried to turn a cart into an order. */
export type PlacementAttempt =
    | AnsweredPlacement
    | { readonly kind: 'unanswered'; readonly reason: string }
    | { readonly kind: 'redirected'; readonly status: number; readonly location: string }
    | { readonly kind: 'refused'; readonly reason: string };

/** One placement that holds its proof and is about to leave for the shop. */
export interface SignedRequest {
    /** The page that sent the request. */
    readonly page: Page;
    /** The browser's request, held at the route. */
    readonly route: Route;
    readonly maskedCartId: string;
    /** The route that named the cart, which reads the shop's answer. */
    readonly placement: PlacementRoute;
    /** The headers that prove the placement. */
    readonly proof: Readonly<Record<string, string>>;
    /** How long the shop may take to answer, the answer's body included. */
    readonly deadlineMs: number;
    /** Takes what became of the placement, or the wait for it: a promise that never rejects. */
    readonly report: (attempt: PlacementAttempt | Promise<PlacementAttempt>) => void;
}

/** Sends a signed placement on its way and answers the browser's request. */
type PlacementSender = (signed: SignedRequest) => Promise<void>;

/** What became of a placement the runner sent, and how the browser's held request ends because of it. */
interface RunnerOutcome {
    readonly attempt: PlacementAttempt;
    readonly endBrowserRequest: () => Promise<void>;
}

/** What the wait for the shop's answer is called when nothing comes. */
const SHOP_ANSWER = 'The shop\'s answer';

/** What the wait for the body of that answer is called. */
const ANSWER_BODY = 'The body of the shop\'s answer';

/** The statuses a browser follows, given an address to go to. */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([300, 301, 302, 303, 307, 308]);

/**
 * Sends the placement from Node and hands the browser the shop's answer, so that the answer is read
 * before the checkout navigates away to payment and takes its body with it. The wait for that answer is
 * reported as it begins: the shop may commit the order while it lasts, so a test that times out meanwhile
 * has its clean-up wait for the answer, or the deadline, before it asks the shop to end the order.
 */
async function sendFromTheRunner(signed: SignedRequest): Promise<void> {
    const outcome = runnerOutcomeOf(signed);

    signed.report(outcome.then(({ attempt }) => attempt));
    await (await outcome).endBrowserRequest();
}

/** What became of a placement sent from Node; it never rejects. */
async function runnerOutcomeOf({ route, maskedCartId, placement, proof, deadlineMs }: SignedRequest): Promise<RunnerOutcome> {
    try {
        const answer = await route.fetch({
            headers: { ...route.request().headers(), ...proof },
            timeout: deadlineMs,
            maxRedirects: 0,
        });
        const body = await answer.text();

        return {
            attempt: { kind: 'answered', maskedCartId, route: placement, status: answer.status(), body },
            endBrowserRequest: async () => {
                try {
                    await route.fulfill({ response: answer, body });
                } catch {
                    // Playwright counts a route as handled before it asks the browser, so a fulfil the browser
                    // turns down leaves nothing to abort: the page's request stays paused until the page goes,
                    // and the test meets that as a page that never moves on. What the shop answered has been
                    // reported, and stands.
                }
            },
        };
    } catch (error) {
        return { attempt: { kind: 'unanswered', reason: reportableMessageOf(error) }, endBrowserRequest: () => route.abort('failed') };
    }
}

/**
 * Lets the browser send its own request with the proof added. The wait for the answer is reported before
 * the request is let go, so that nothing leaves unheld: the shop may commit the order from then on. It goes
 * on after the handler has ended with `route.continue()`, as one promise that settles by the deadline and
 * never rejects, so whoever awaits it, or nobody, leaves nothing to fail after the test ended. A continue
 * that fails ends that same wait, which stays the one report of this placement.
 */
async function sendFromTheBrowser(signed: SignedRequest): Promise<void> {
    const { route, proof, report } = signed;
    const request = route.request();
    let notSent: (reason: unknown) => void = () => undefined;
    const sendFailed = new Promise<never>((_resolve, reject) => {
        notSent = reject;
    });

    report(attemptOf(request, sendFailed, signed));

    try {
        await route.continue({ headers: { ...request.headers(), ...proof } });
    } catch (error) {
        notSent(error);
    }
}

/**
 * What became of a request the browser was given to send; it never rejects. It asks for the answer at
 * once, before the request is let go, and gives up when `sendFailed` rejects. One deadline covers the answer
 * and its body, counted from here: the wait as a whole is what holds the clean-up back.
 */
async function attemptOf(
    request: Request,
    sendFailed: Promise<never>,
    { page, maskedCartId, placement, deadlineMs }: SignedRequest,
): Promise<PlacementAttempt> {
    const startedAt = performance.now();

    try {
        const answer = await withinDeadline(Promise.race([request.response(), sendFailed]), SHOP_ANSWER, deadlineMs);

        if (answer === null) {
            return { kind: 'unanswered', reason: request.failure()?.errorText ?? 'no answer' };
        }

        if (wasRedirected(request, answer)) {
            return { kind: 'redirected', status: answer.status(), location: answer.headers().location ?? '(no address)' };
        }

        const leftMs = deadlineMs - (performance.now() - startedAt);

        return { kind: 'answered', maskedCartId, route: placement, status: answer.status(), body: await bodyOf(answer, page, leftMs) };
    } catch (error) {
        return { kind: 'unanswered', reason: reportableMessageOf(error) };
    }
}

/**
 * Whether the browser went on from this answer to a redirect's address. The next hop may not have been
 * seen yet when the answer arrives, so the answer's own status and address count as well.
 */
function wasRedirected(request: Request, answer: Response): boolean {
    return request.redirectedTo() !== null || (REDIRECT_STATUSES.has(answer.status()) && answer.headers().location !== undefined);
}

/**
 * The body of an answer; nothing once it cannot be read. A body goes with the page it was fetched for,
 * and a checkout may go on to payment the moment the answer arrives, so losing it is no failure: the
 * status has already said what the shop did. Playwright has a body only once the page has read it and
 * otherwise waits for good, so a new document in the page ends the wait as well as `leftMs` running out does. A
 * change of address within the document takes nothing away, and does not.
 */
async function bodyOf(answer: Response, page: Page, leftMs: number): Promise<string | null> {
    let pageLeft = (): void => undefined;
    const left = new Promise<null>(resolve => {
        pageLeft = () => {
            resolve(null);
        };
    });

    page.once('domcontentloaded', pageLeft);

    try {
        return await withinDeadline(Promise.race([answer.text(), left]), ANSWER_BODY, leftMs);
    } catch {
        return null;
    } finally {
        page.off('domcontentloaded', pageLeft);
    }
}

/** How a signed placement reaches the shop, per client. */
export const PLACEMENT_SENDERS: Readonly<Record<ShopClient, PlacementSender>> = {
    runner: sendFromTheRunner,
    browser: sendFromTheBrowser,
};
