"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouteOf = adminRouteOf;
/**
 * The name of the route parameter Magento puts the per-route secret key of an admin address in, while
 * `admin/security/use_form_key` is on: `…/catalog/product/edit/id/5/key/<hash>/`.
 */
const SECRET_KEY_PARAMETER = 'key';
/** Where a route's parameters start: after its front name, controller and action. */
const FIRST_PARAMETER = 3;
/** The controller and the action Magento runs where an address leaves them out. */
const DEFAULT_PART = 'index';
/**
 * The route of an admin address below the admin's own address, without its secret key and its query:
 * `catalog/product/edit/id/5` for `https://shop.test/backoffice/catalog/product/edit/id/5/key/0a1b/`, and
 * `''` for the admin's address itself. A controller or an action the address leaves out reads `index`, as
 * Magento runs it: `catalog/product/` is `catalog/product/index`. The same page has the same route whether
 * the shop puts secret keys in its admin addresses or not, which is what makes it something to assert on.
 *
 * Nothing when the address is not below the admin's: another origin, or another path.
 */
function adminRouteOf(url, adminUrl) {
    const admin = new URL(adminUrl);
    const target = new URL(url);
    const adminPath = admin.pathname.endsWith('/') ? admin.pathname : `${admin.pathname}/`;
    const targetPath = target.pathname.endsWith('/') ? target.pathname : `${target.pathname}/`;
    if (target.origin !== admin.origin || !targetPath.startsWith(adminPath)) {
        return undefined;
    }
    return withDefaultParts(withoutSecretKey(targetPath.slice(adminPath.length).split('/').filter(segment => segment !== '')))
        .join('/');
}
/** A route that names its front name with its controller and action, `index` for each one it leaves out. */
function withDefaultParts(segments) {
    return segments.length === 0 || segments.length >= FIRST_PARAMETER
        ? segments
        : [...segments, ...Array.from({ length: FIRST_PARAMETER - segments.length }, () => DEFAULT_PART)];
}
/**
 * The route's segments without the secret key's pair. Parameters come in name and value pairs after the
 * action, so only a segment in a name's place is read as the key's name.
 */
function withoutSecretKey(segments) {
    const key = segments.findIndex((segment, index) => index >= FIRST_PARAMETER && (index - FIRST_PARAMETER) % 2 === 0 && segment === SECRET_KEY_PARAMETER);
    return key === -1 ? segments : [...segments.slice(0, key), ...segments.slice(key + 2)];
}
