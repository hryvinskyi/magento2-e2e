"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLACEMENT_SENDERS = void 0;
const answers_1 = require("./answers");
const deadline_1 = require("./deadline");
/** What the wait for the shop's answer is called when nothing comes. */
const SHOP_ANSWER = 'The shop\'s answer';
/** What the wait for the body of that answer is called. */
const ANSWER_BODY = 'The body of the shop\'s answer';
/** The statuses a browser follows, given an address to go to. */
const REDIRECT_STATUSES = new Set([300, 301, 302, 303, 307, 308]);
/**
 * Sends the placement from Node and hands the browser the shop's answer, so that the answer is read
 * before the checkout navigates away to payment and takes its body with it. The wait for that answer is
 * reported as it begins: the shop may commit the order while it lasts, so a test that times out meanwhile
 * has its clean-up wait for the answer, or the deadline, before it asks the shop to end the order.
 */
async function sendFromTheRunner(signed) {
    const outcome = runnerOutcomeOf(signed);
    signed.report(outcome.then(({ attempt }) => attempt));
    await (await outcome).endBrowserRequest();
}
/** What became of a placement sent from Node; it never rejects. */
async function runnerOutcomeOf({ route, maskedCartId, placement, proof, deadlineMs }) {
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
                }
                catch {
                    // Playwright counts a route as handled before it asks the browser, so a fulfil the browser
                    // turns down leaves nothing to abort: the page's request stays paused until the page goes,
                    // and the test meets that as a page that never moves on. What the shop answered has been
                    // reported, and stands.
                }
            },
        };
    }
    catch (error) {
        return { attempt: { kind: 'unanswered', reason: (0, answers_1.reportableMessageOf)(error) }, endBrowserRequest: () => route.abort('failed') };
    }
}
/**
 * Lets the browser send its own request with the proof added. The wait for the answer is reported before
 * the request is let go, so that nothing leaves unheld: the shop may commit the order from then on. It goes
 * on after the handler has ended with `route.continue()`, as one promise that settles by the deadline and
 * never rejects, so whoever awaits it, or nobody, leaves nothing to fail after the test ended. A continue
 * that fails ends that same wait, which stays the one report of this placement.
 */
async function sendFromTheBrowser(signed) {
    const { route, proof, report } = signed;
    const request = route.request();
    let notSent = () => undefined;
    const sendFailed = new Promise((_resolve, reject) => {
        notSent = reject;
    });
    report(attemptOf(request, sendFailed, signed));
    try {
        await route.continue({ headers: { ...request.headers(), ...proof } });
    }
    catch (error) {
        notSent(error);
    }
}
/**
 * What became of a request the browser was given to send; it never rejects. It asks for the answer at
 * once, before the request is let go, and gives up when `sendFailed` rejects. One deadline covers the answer
 * and its body, counted from here: the wait as a whole is what holds the clean-up back.
 */
async function attemptOf(request, sendFailed, { page, maskedCartId, placement, deadlineMs }) {
    const startedAt = performance.now();
    try {
        const answer = await (0, deadline_1.withinDeadline)(Promise.race([request.response(), sendFailed]), SHOP_ANSWER, deadlineMs);
        if (answer === null) {
            return { kind: 'unanswered', reason: request.failure()?.errorText ?? 'no answer' };
        }
        if (wasRedirected(request, answer)) {
            return { kind: 'redirected', status: answer.status(), location: answer.headers().location ?? '(no address)' };
        }
        const leftMs = deadlineMs - (performance.now() - startedAt);
        return { kind: 'answered', maskedCartId, route: placement, status: answer.status(), body: await bodyOf(answer, page, leftMs) };
    }
    catch (error) {
        return { kind: 'unanswered', reason: (0, answers_1.reportableMessageOf)(error) };
    }
}
/**
 * Whether the browser went on from this answer to a redirect's address. The next hop may not have been
 * seen yet when the answer arrives, so the answer's own status and address count as well.
 */
function wasRedirected(request, answer) {
    return request.redirectedTo() !== null || (REDIRECT_STATUSES.has(answer.status()) && answer.headers().location !== undefined);
}
/**
 * The body of an answer; nothing once it cannot be read. A body goes with the page it was fetched for,
 * and a checkout may go on to payment the moment the answer arrives, so losing it is no failure: the
 * status has already said what the shop did. Playwright has a body only once the page has read it and
 * otherwise waits for good, so a new document in the page ends the wait as well as `leftMs` running out does. A
 * change of address within the document takes nothing away, and does not.
 */
async function bodyOf(answer, page, leftMs) {
    let pageLeft = () => undefined;
    const left = new Promise(resolve => {
        pageLeft = () => {
            resolve(null);
        };
    });
    page.once('domcontentloaded', pageLeft);
    try {
        return await (0, deadline_1.withinDeadline)(Promise.race([answer.text(), left]), ANSWER_BODY, leftMs);
    }
    catch {
        return null;
    }
    finally {
        page.off('domcontentloaded', pageLeft);
    }
}
/** How a signed placement reaches the shop, per client. */
exports.PLACEMENT_SENDERS = {
    runner: sendFromTheRunner,
    browser: sendFromTheBrowser,
};
