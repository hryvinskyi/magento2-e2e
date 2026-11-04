import type { Locator, Page } from '@playwright/test';
import type { PageGuard } from '../project/project';
/** Never loads anything from the hosts `pattern` matches: every request of the page to them is aborted. */
export declare function blockedHosts(pattern: RegExp): PageGuard;
/**
 * Sets a session-storage entry in every document of the page before the page's own scripts run — how
 * a test tells an overlay that this tab already answered it. A document without storage (an
 * `about:blank` or `data:` page) is left as it is.
 */
export declare function sessionStorageFlag(key: string, value: string): PageGuard;
/**
 * Dismisses the overlay `selector` matches whenever it covers the page before an action or an
 * assertion of the test, however late it opens.
 */
export declare function dismissOnSight(selector: string, dismiss: (overlay: Locator, page: Page) => Promise<void>): PageGuard;
/**
 * A dismissal that clicks the element `selector` matches inside the overlay — its close or decline
 * button — and presses Escape when the overlay offers none.
 */
export declare function clickInside(selector: string): (overlay: Locator, page: Page) => Promise<void>;
