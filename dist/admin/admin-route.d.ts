/**
 * The route of an admin address below the admin's own address, without its secret key and its query:
 * `catalog/product/edit/id/5` for `https://shop.test/backoffice/catalog/product/edit/id/5/key/0a1b/`, and
 * `''` for the admin's address itself. A controller or an action the address leaves out reads `index`, as
 * Magento runs it: `catalog/product/` is `catalog/product/index`. The same page has the same route whether
 * the shop puts secret keys in its admin addresses or not, which is what makes it something to assert on.
 *
 * Nothing when the address is not below the admin's: another origin, or another path.
 */
export declare function adminRouteOf(url: string, adminUrl: string): string | undefined;
