"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.observeAdminPage = observeAdminPage;
const admin_markup_1 = require("./admin-markup");
const admin_route_1 = require("./admin-route");
/** What the page shows of the admin right now, once its document has loaded. */
async function observeAdminPage(page, adminUrl) {
    await page.waitForLoadState('domcontentloaded');
    const url = page.url();
    const form = page.locator(admin_markup_1.ADMIN_MARKUP.signInForm);
    const signInForm = await form.count() > 0;
    return {
        url,
        route: (0, admin_route_1.adminRouteOf)(url, adminUrl),
        signInForm,
        captcha: signInForm && await form.locator(admin_markup_1.ADMIN_MARKUP.captcha).count() > 0,
        signInError: signInForm && await page.locator(admin_markup_1.ADMIN_MARKUP.signInError).count() > 0,
    };
}
