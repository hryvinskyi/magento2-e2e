import type { Page } from '@playwright/test';
import type { AdminPageObservation } from './admin-page-state';
/** What the page shows of the admin right now, once its document has loaded. */
export declare function observeAdminPage(page: Page, adminUrl: string): Promise<AdminPageObservation>;
