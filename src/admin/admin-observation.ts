import type { Page } from '@playwright/test';
import { ADMIN_MARKUP } from './admin-markup';
import type { AdminPageObservation } from './admin-page-state';
import { adminRouteOf } from './admin-route';

/** What the page shows of the admin right now, once its document has loaded. */
export async function observeAdminPage(page: Page, adminUrl: string): Promise<AdminPageObservation> {
    await page.waitForLoadState('domcontentloaded');

    const url = page.url();
    const form = page.locator(ADMIN_MARKUP.signInForm);
    const signInForm = await form.count() > 0;

    return {
        url,
        route: adminRouteOf(url, adminUrl),
        signInForm,
        captcha: signInForm && await form.locator(ADMIN_MARKUP.captcha).count() > 0,
        signInError: signInForm && await page.locator(ADMIN_MARKUP.signInError).count() > 0,
    };
}
