import type { Page, Response } from '@playwright/test';
import type { StorefrontBehaviour } from '../project/project';
import type { RegisteredStore } from '../project/stores';
/**
 * One store view in the environment under test: resolves paths against its base URL, records the
 * visitor's consent before the first visit, and releases the assets the shop's pages hold back.
 */
export declare class Storefront {
    readonly page: Page;
    readonly store: RegisteredStore;
    /** The store view's base URL, with a trailing slash. */
    readonly baseUrl: string;
    private readonly behaviour;
    constructor(page: Page, store: RegisteredStore, baseUrl: string, behaviour: StorefrontBehaviour);
    /**
     * The absolute URL of a path inside this store view. A path is relative to the store's base URL,
     * so a leading slash is dropped: that keeps a store view below a path (`/fr/`) working.
     */
    url(path?: string): string;
    /** Opens a path of this store view, with the visitor's consent recorded first when the project has a policy for it. */
    open(path?: string): Promise<Response | null>;
    /**
     * Applies the stylesheets the page holds back until the visitor's first interaction. Until then an
     * element is drawn only by the styles already applied, so a computed colour, size or position read
     * from it is not what a visitor sees: call it before any assertion about how something looks.
     *
     * It wakes the page until nothing matches the project's selector of held-back stylesheets, then
     * waits for every linked stylesheet to load or fail. A project without that selector only waits.
     */
    applyDeferredStylesheets(): Promise<void>;
    /**
     * Runs the scripts the page holds back until the visitor's first interaction; until then nothing
     * they draw or bind is on the page. Call it before a test works a scripted surface, so the scripts
     * do not start in the middle of its first click, and before asserting that a script did not run:
     * only once nothing is held back does "it did not run" mean anything. A project without a
     * selector of held-back scripts has nothing to release.
     */
    runDeferredScripts(): Promise<void>;
    /** Wakes the page until no element matches `selector`. */
    private releaseAll;
    /**
     * The visitor's first interaction, as a loader of held-back assets waits for it: a mouse move on
     * the document. It asks for nothing else, where a scroll would also be read by a listing's
     * endless scrolling as a cue to load the next page.
     */
    private wake;
}
