"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consentCookie = consentCookie;
/**
 * Records consent as the cookie the shop's consent banner reads: before a visit, the cookie `name`
 * with `value` is added for the store's base URL, unless the browser already holds a cookie of that
 * name there — a test that set its own consent, or the shop that rewrote it, keeps its value.
 */
function consentCookie(name, value) {
    return Object.freeze({
        async beforeVisit(context, baseUrl) {
            const cookies = await context.cookies(baseUrl);
            if (!cookies.some(cookie => cookie.name === name)) {
                await context.addCookies([{ name, value, url: baseUrl }]);
            }
        },
    });
}
