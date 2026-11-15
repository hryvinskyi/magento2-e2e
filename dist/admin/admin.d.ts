import type { Locator, Page } from '@playwright/test';
/** The id of an item of the admin menu, as its `data-ui-id` attribute holds it: `menu-magento-backend-dashboard`. */
export type AdminMenuItemId = `menu-${string}`;
/** The kinds of message the admin's messages area shows. */
export type AdminMessageKind = 'success' | 'error' | 'warning' | 'notice';
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
export declare class Admin {
    readonly page: Page;
    /** The admin's address, with a trailing slash. */
    readonly baseUrl: string;
    constructor(page: Page, baseUrl: string);
    /** Opens the admin's start page — the dashboard, unless the shop chose another — at the admin's own address. */
    open(): Promise<void>;
    /**
     * Opens the page of an item of the admin menu, by the id its `data-ui-id` attribute holds
     * (`menu-magento-catalog-catalog-products`), at the address the menu gives it. The menu is read from
     * the page the test is on, or from the start page when that page has no such item. An item that only
     * opens a submenu has no page of its own and is refused.
     */
    openMenuItem(id: AdminMenuItemId): Promise<void>;
    /** Opens the address of a link the page shows, as it gives it: with the secret key the shop put in it, if any. */
    follow(link: Locator): Promise<void>;
    /**
     * The route of the page below the admin's address, without the secret key and the query:
     * `catalog/product/edit/id/5`, or `''` on the admin's start page. It reads the same whether the shop
     * puts secret keys in its addresses or not. A page outside the admin is refused.
     */
    route(): string;
    /** The messages of one kind in the page's messages area, where a save says what it did. */
    messages(kind: AdminMessageKind): Locator;
    /**
     * Waits until the page has loaded and none of the admin's loading masks or spinners is shown, so an
     * assertion reads the page a person would read. Masks that appear later, for data a click asks for,
     * need another call after that click.
     */
    settled(): Promise<void>;
    /**
     * The form key of the page's session, for a request of the test's own through the page's session
     * (`page.request.post(address, { form: { form_key: await admin.formKey(), ... } })`): the admin refuses a
     * form sent without it. A page that holds none is refused.
     */
    formKey(): Promise<string>;
    /** Opens an address and checks that the page still has the session. */
    private goto;
    /** The absolute address a link points at; a link that points nowhere of its own is refused, naming `what` it is. */
    private addressOf;
}
