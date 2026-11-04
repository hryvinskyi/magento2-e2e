import type { Page, Request } from '@playwright/test';
/**
 * Whether a request navigates the page itself. Opening a frame inside the page is a navigation too, and
 * Playwright has no frame to name for one still being created, which is never the page's own.
 */
export declare function navigatesThePage(request: Pick<Request, 'isNavigationRequest' | 'frame'>, page: Pick<Page, 'mainFrame'>): boolean;
