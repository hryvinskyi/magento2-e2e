"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Storefront = void 0;
const test_1 = require("@playwright/test");
/** How often the page is woken while held-back assets remain, and for how long at most. */
const WAKE_INTERVALS_MS = [250, 500, 1_000];
const RELEASE_TIMEOUT_MS = 20_000;
/** How long one stylesheet may take to load once the page asked for it. */
const STYLESHEET_LOAD_MS = 15_000;
/**
 * One store view in the environment under test: resolves paths against its base URL, records the
 * visitor's consent before the first visit, and releases the assets the shop's pages hold back.
 */
class Storefront {
    page;
    store;
    /** The store view's base URL, with a trailing slash. */
    baseUrl;
    behaviour;
    constructor(page, store, baseUrl, behaviour) {
        this.page = page;
        this.store = store;
        this.baseUrl = baseUrl;
        this.behaviour = behaviour;
    }
    /**
     * The absolute URL of a path inside this store view. A path is relative to the store's base URL,
     * so a leading slash is dropped: that keeps a store view below a path (`/fr/`) working.
     */
    url(path = '') {
        return new URL(path.replace(/^\/+/, ''), this.baseUrl).toString();
    }
    /** Opens a path of this store view, with the visitor's consent recorded first when the project has a policy for it. */
    async open(path = '') {
        await this.behaviour.consent?.beforeVisit(this.page.context(), this.baseUrl);
        return this.page.goto(this.url(path), { waitUntil: 'domcontentloaded' });
    }
    /**
     * Applies the stylesheets the page holds back until the visitor's first interaction. Until then an
     * element is drawn only by the styles already applied, so a computed colour, size or position read
     * from it is not what a visitor sees: call it before any assertion about how something looks.
     *
     * It wakes the page until nothing matches the project's selector of held-back stylesheets, then
     * waits for every linked stylesheet to load or fail. A project without that selector only waits.
     */
    async applyDeferredStylesheets() {
        const deferred = this.behaviour.deferredAssets?.stylesheets;
        if (deferred !== undefined) {
            await this.releaseAll(deferred, 'stylesheets still held back');
        }
        const pending = await this.page.evaluate(async (timeoutMs) => {
            const settled = (link) => (link.sheet !== null
                ? Promise.resolve(null)
                : new Promise(resolve => {
                    link.addEventListener('load', () => { resolve(null); }, { once: true });
                    link.addEventListener('error', () => { resolve(null); }, { once: true });
                    setTimeout(() => { resolve(link.sheet === null ? link.href : null); }, timeoutMs);
                }));
            const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
            return (await Promise.all(links.map(settled))).filter(href => href !== null);
        }, STYLESHEET_LOAD_MS);
        (0, test_1.expect)(pending, `stylesheets still not applied after ${String(STYLESHEET_LOAD_MS / 1_000)} s`).toEqual([]);
    }
    /**
     * Runs the scripts the page holds back until the visitor's first interaction; until then nothing
     * they draw or bind is on the page. Call it before a test works a scripted surface, so the scripts
     * do not start in the middle of its first click, and before asserting that a script did not run:
     * only once nothing is held back does "it did not run" mean anything. A project without a
     * selector of held-back scripts has nothing to release.
     */
    async runDeferredScripts() {
        const deferred = this.behaviour.deferredAssets?.scripts;
        if (deferred !== undefined) {
            await this.releaseAll(deferred, 'scripts still held back');
        }
    }
    /** Wakes the page until no element matches `selector`. */
    async releaseAll(selector, failure) {
        await (0, test_1.expect)(async () => {
            await this.wake();
            (0, test_1.expect)(await this.page.locator(selector).count(), failure).toBe(0);
        }).toPass({ intervals: [...WAKE_INTERVALS_MS], timeout: RELEASE_TIMEOUT_MS });
    }
    /**
     * The visitor's first interaction, as a loader of held-back assets waits for it: a mouse move on
     * the document. It asks for nothing else, where a scroll would also be read by a listing's
     * endless scrolling as a cue to load the next page.
     */
    async wake() {
        await this.page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove')));
    }
}
exports.Storefront = Storefront;
