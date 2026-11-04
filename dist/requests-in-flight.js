"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestsInFlight = void 0;
const test_1 = require("@playwright/test");
/**
 * The requests of a few kinds that a page has sent and not yet had answered. It sees only requests
 * sent after it started watching.
 */
class RequestsInFlight {
    pending = new Set();
    what;
    constructor(what) {
        this.what = what;
    }
    /** Starts watching the requests whose URL matches one of `urls`; `what` names them in a failure. */
    static watch(page, urls, what) {
        const watched = new RequestsInFlight(what);
        const answered = (request) => {
            watched.pending.delete(request);
        };
        page.on('request', request => {
            if (urls.some(url => url.test(request.url()))) {
                watched.pending.add(request);
            }
        });
        page.on('requestfinished', answered);
        page.on('requestfailed', answered);
        return watched;
    }
    /** Resolves once every watched request sent so far has been answered or has failed. */
    async settled() {
        await test_1.expect.poll(() => this.pending.size, { message: `${this.what} still waiting for an answer` }).toBe(0);
    }
}
exports.RequestsInFlight = RequestsInFlight;
