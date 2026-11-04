export type DeferredState = 'pending' | 'resolved' | 'rejected';
export interface JQueryPromise {
    done(callback: (...values: unknown[]) => void): JQueryPromise;
    fail(callback: (...reasons: unknown[]) => void): JQueryPromise;
    always(callback: () => void): JQueryPromise;
    state(): DeferredState;
}
export interface JQueryDeferred extends JQueryPromise {
    resolve(...values: unknown[]): JQueryDeferred;
    reject(...reasons: unknown[]): JQueryDeferred;
    promise(): JQueryPromise;
}
/** The DOM-free part of jQuery that tests rely on. */
export interface JQueryCore {
    Deferred(): JQueryDeferred;
    when(...values: unknown[]): JQueryPromise;
}
/**
 * The Magento installation's own jQuery (`lib/web/jquery.js` below `magentoRoot`), loaded in plain
 * Node — a fresh copy on every call — so that a pure module built on jQuery Deferreds is tested
 * against the real implementation: the same synchronous `done`/`fail`, the same `state()`, the same
 * `$.when`, instead of a stand-in that only resembles it.
 *
 * Node has no DOM. jQuery reads the document while it loads (feature tests, the ready handler), so it
 * is given an inert one: every property and call on it answers with another inert value. Only
 * jQuery's DOM-free parts are meaningful here — `Deferred`, `when`, `Callbacks`, `extend`; anything
 * that touches elements, events or requests does nothing useful and must not be relied on.
 */
export declare function loadMagentoJQuery(magentoRoot: string): JQueryCore;
