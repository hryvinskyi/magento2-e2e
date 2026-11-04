import type { BrowserContext } from '@playwright/test';
import type { ConsentPolicy } from '../project/project';

/**
 * Records consent as the cookie the shop's consent banner reads: before a visit, the cookie `name`
 * with `value` is added for the store's base URL, unless the browser already holds a cookie of that
 * name there — a test that set its own consent, or the shop that rewrote it, keeps its value.
 */
export function consentCookie(name: string, value: string): ConsentPolicy {
    return Object.freeze({
        async beforeVisit(context: BrowserContext, baseUrl: string): Promise<void> {
            const cookies = await context.cookies(baseUrl);

            if (!cookies.some(cookie => cookie.name === name)) {
                await context.addCookies([{ name, value, url: baseUrl }]);
            }
        },
    });
}
