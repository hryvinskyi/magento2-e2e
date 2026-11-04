import type { Locator, Page } from '@playwright/test';
import type { PageGuard } from '../project/project';

/** Never loads anything from the hosts `pattern` matches: every request of the page to them is aborted. */
export function blockedHosts(pattern: RegExp): PageGuard {
    return Object.freeze({
        async install(page: Page): Promise<void> {
            await page.route(pattern, route => route.abort());
        },
    });
}

/**
 * Sets a session-storage entry in every document of the page before the page's own scripts run — how
 * a test tells an overlay that this tab already answered it. A document without storage (an
 * `about:blank` or `data:` page) is left as it is.
 */
export function sessionStorageFlag(key: string, value: string): PageGuard {
    return Object.freeze({
        async install(page: Page): Promise<void> {
            await page.addInitScript((entry: { readonly key: string; readonly value: string }) => {
                try {
                    window.sessionStorage.setItem(entry.key, entry.value);
                } catch {
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
export function dismissOnSight(
    selector: string,
    dismiss: (overlay: Locator, page: Page) => Promise<void>,
): PageGuard {
    return Object.freeze({
        async install(page: Page): Promise<void> {
            const overlay = page.locator(selector);

            await page.addLocatorHandler(overlay, () => dismiss(overlay, page));
        },
    });
}

/**
 * A dismissal that clicks the element `selector` matches inside the overlay — its close or decline
 * button — and presses Escape when the overlay offers none.
 */
export function clickInside(selector: string): (overlay: Locator, page: Page) => Promise<void> {
    return async (overlay: Locator, page: Page): Promise<void> => {
        const control = overlay.locator(selector);

        if (await control.count() > 0) {
            await control.click();
        } else {
            await page.keyboard.press('Escape');
        }
    };
}
