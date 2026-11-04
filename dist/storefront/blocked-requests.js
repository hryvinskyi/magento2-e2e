"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockRequests = blockRequests;
/**
 * Aborts every request of the context whose URL matches one of `patterns`, on every page the context
 * opens, pop-ups included.
 *
 * A route a test registers on a page runs before these, whatever the order they were registered in:
 * a test that counts such requests sees each one first, and a `fallback()` from its route ends here.
 */
async function blockRequests(context, patterns) {
    for (const pattern of patterns) {
        await context.route(pattern, route => route.abort());
    }
}
