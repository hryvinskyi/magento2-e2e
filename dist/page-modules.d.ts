import type { JSHandle, Page } from '@playwright/test';
/**
 * Loads one of the page's AMD modules inside the page, through the page's own RequireJS, and answers
 * with a handle to it. The module stays in the page: a later `page.evaluate()` receives it as an
 * argument and narrows it there before using it. Rejects when the page has no RequireJS or the module
 * cannot be loaded.
 */
export declare function pageModule(page: Page, name: string): Promise<JSHandle<unknown>>;
