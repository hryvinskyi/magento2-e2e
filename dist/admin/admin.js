"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Admin = void 0;
const test_1 = require("@playwright/test");
const admin_markup_1 = require("./admin-markup");
const admin_observation_1 = require("./admin-observation");
const admin_page_state_1 = require("./admin-page-state");
const admin_route_1 = require("./admin-route");
/** What a menu item id may hold: Magento writes `data-ui-id` values in lower case, digits, `-` and `_`. */
const MENU_ITEM_ID = /^menu-[a-z0-9_-]+$/;
/** How long `settled()` waits for the admin's loading masks to go. */
const SETTLE_TIMEOUT_MS = 30_000;
/**
 * The shop's admin, on a page whose context holds the worker's admin session.
 *
 * It opens pages the way a person reaches them — the start page, a menu item, a link the page shows —
 * because an address typed by hand does not work in every shop: with `admin/security/use_form_key` on,
 * Magento puts a secret key in every admin address and sends an address without it to the dashboard. The
 * key is a hash made with the shop's encryption key, which a test does not have, so there is no way to
 * open a route by its name.
 *
 * Every page it opens is checked for the session: one that shows the sign-in form fails the test,
 * saying why a session ends.
 */
class Admin {
    page;
    /** The admin's address, with a trailing slash. */
    baseUrl;
    constructor(page, baseUrl) {
        this.page = page;
        this.baseUrl = baseUrl;
    }
    /** Opens the admin's start page — the dashboard, unless the shop chose another — at the admin's own address. */
    async open() {
        await this.goto(this.baseUrl);
    }
    /**
     * Opens the page of an item of the admin menu, by the id its `data-ui-id` attribute holds
     * (`menu-magento-catalog-catalog-products`), at the address the menu gives it. The menu is read from
     * the page the test is on, or from the start page when that page has no such item. An item that only
     * opens a submenu has no page of its own and is refused.
     */
    async openMenuItem(id) {
        if (!MENU_ITEM_ID.test(id)) {
            throw new Error(`"${id}" is not the id of an admin menu item: such an id is the item's data-ui-id, such as menu-magento-backend-dashboard.`);
        }
        const item = this.page.locator(`[data-ui-id="${id}"] > a, a[data-ui-id="${id}"]`).first();
        if (await item.count() === 0) {
            await this.open();
        }
        if (await item.count() === 0) {
            throw new Error(`The admin menu has no item ${id}: the module that adds it is disabled, or the admin user's role does not allow it.`);
        }
        await this.goto(await this.addressOf(item, `The menu item ${id}`));
    }
    /** Opens the address of a link the page shows, as it gives it: with the secret key the shop put in it, if any. */
    async follow(link) {
        if (await link.count() === 0) {
            throw new Error(`The link to follow is not on the page: ${link.toString()}.`);
        }
        await this.goto(await this.addressOf(link.first(), 'The link'));
    }
    /**
     * The route of the page below the admin's address, without the secret key and the query:
     * `catalog/product/edit/id/5`, or `''` on the admin's start page. It reads the same whether the shop
     * puts secret keys in its addresses or not. A page outside the admin is refused.
     */
    route() {
        const route = (0, admin_route_1.adminRouteOf)(this.page.url(), this.baseUrl);
        if (route === undefined) {
            throw new Error(`The page at ${new URL(this.page.url()).origin} is not below the admin at ${this.baseUrl}.`);
        }
        return route;
    }
    /** The messages of one kind in the page's messages area, where a save says what it did. */
    messages(kind) {
        return this.page.locator(admin_markup_1.ADMIN_MARKUP.message.replace('{kind}', kind));
    }
    /**
     * Waits until the page has loaded and none of the admin's loading masks or spinners is shown, so an
     * assertion reads the page a person would read. Masks that appear later, for data a click asks for,
     * need another call after that click.
     */
    async settled() {
        await this.page.waitForLoadState('load');
        await (0, test_1.expect)(this.page.locator(admin_markup_1.ADMIN_MARKUP.loading).filter({ visible: true }), 'the admin is still loading')
            .toHaveCount(0, { timeout: SETTLE_TIMEOUT_MS });
    }
    /**
     * The form key of the page's session, for a request of the test's own through the page's session
     * (`page.request.post(address, { form: { form_key: await admin.formKey(), ... } })`): the admin refuses a
     * form sent without it. A page that holds none is refused.
     */
    async formKey() {
        const key = await this.page.evaluate(selector => window.FORM_KEY ?? document.querySelector(selector)?.value, admin_markup_1.ADMIN_MARKUP.formKey);
        if (typeof key !== 'string' || key === '') {
            throw new Error(`The admin page ${this.route()} holds no form key.`);
        }
        return key;
    }
    /** Opens an address and checks that the page still has the session. */
    async goto(url) {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        const ended = (0, admin_page_state_1.sessionEnd)((0, admin_page_state_1.adminPageState)(await (0, admin_observation_1.observeAdminPage)(this.page, this.baseUrl)), this.baseUrl);
        if (ended !== undefined) {
            throw new Error(ended);
        }
    }
    /** The absolute address a link points at; a link that points nowhere of its own is refused, naming `what` it is. */
    async addressOf(link, what) {
        const href = (await link.getAttribute('href'))?.trim() ?? '';
        if (href === '' || href.startsWith('#') || /^javascript:/i.test(href)) {
            throw new Error(`${what} has no address of its own (href "${href}"): it opens a submenu or runs a script.`);
        }
        return new URL(href, this.page.url()).toString();
    }
}
exports.Admin = Admin;
