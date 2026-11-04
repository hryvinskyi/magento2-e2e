"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockedHosts = blockedHosts;
exports.sessionStorageFlag = sessionStorageFlag;
exports.dismissOnSight = dismissOnSight;
exports.clickInside = clickInside;
/** Never loads anything from the hosts `pattern` matches: every request of the page to them is aborted. */
function blockedHosts(pattern) {
    return Object.freeze({
        async install(page) {
            await page.route(pattern, route => route.abort());
        },
    });
}
/**
 * Sets a session-storage entry in every document of the page before the page's own scripts run — how
 * a test tells an overlay that this tab already answered it. A document without storage (an
 * `about:blank` or `data:` page) is left as it is.
 */
function sessionStorageFlag(key, value) {
    return Object.freeze({
        async install(page) {
            await page.addInitScript((entry) => {
                try {
                    window.sessionStorage.setItem(entry.key, entry.value);
                }
                catch {
                    // Reading `sessionStorage` throws in a document that has none; such a document shows no overlay.
                }
            }, { key, value });
        },
    });
}
/**
 * Dismisses the overlay `selector` matches whenever it covers the page before an action or an
 * assertion of the test, however late it opens.
 */
function dismissOnSight(selector, dismiss) {
    return Object.freeze({
        async install(page) {
            const overlay = page.locator(selector);
            await page.addLocatorHandler(overlay, () => dismiss(overlay, page));
        },
    });
}
/**
 * A dismissal that clicks the element `selector` matches inside the overlay — its close or decline
 * button — and presses Escape when the overlay offers none.
 */
function clickInside(selector) {
    return async (overlay, page) => {
        const control = overlay.locator(selector);
        if (await control.count() > 0) {
            await control.click();
        }
        else {
            await page.keyboard.press('Escape');
        }
    };
}
