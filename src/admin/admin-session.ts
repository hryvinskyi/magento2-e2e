import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { AdminCredentials } from '../environment/environment';
import { ADMIN_MARKUP } from './admin-markup';
import { observeAdminPage } from './admin-observation';
import { adminPageState, signInFailure } from './admin-page-state';
import type { AdminPageObservation } from './admin-page-state';

/** The cookies and storage of a signed-in admin, as a context is opened with them. */
export type AdminStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** Signs in to the admin and answers with the session it got. */
export type AdminSignIn = () => Promise<AdminStorageState>;

/**
 * The admin session of one worker: signed in on the first test that asks for it, then handed to every
 * later test of the worker. It is kept in memory only, never written to a file.
 *
 * A sign-in that fails is not tried again: every later test of the worker fails with the same reason,
 * because each further attempt with a wrong password brings the user closer to being locked.
 */
export class AdminSession {
    private readonly signIn: AdminSignIn;
    private signedIn: Promise<AdminStorageState> | undefined;

    public constructor(signIn: AdminSignIn) {
        this.signIn = signIn;
    }

    /** The session's cookies and storage; the first call signs in. */
    public storageState(): Promise<AdminStorageState> {
        this.signedIn ??= this.signIn();

        return this.signedIn;
    }
}

/** Where to sign in, and as whom. */
export interface AdminSignInTarget {
    /** The admin's address, with a trailing slash. */
    readonly adminUrl: string;
    readonly credentials: AdminCredentials;
}

/**
 * Signs in to the admin through its sign-in form, in a context of its own that is closed again before
 * this answers, and answers with the session. A sign-in that does not reach the admin is refused with
 * one message saying why: wrong credentials, a CAPTCHA, two-factor authentication, a sign-in handed to
 * another site.
 *
 * The context gets the run's context options, as every context a test opens does. The user name and the
 * password reach the page through a script, never as typed text: the report names every typing step with
 * the text it typed.
 */
export async function signInToAdmin(browser: Browser, { adminUrl, credentials }: AdminSignInTarget): Promise<AdminStorageState> {
    const context = await browser.newContext();

    try {
        const page = await context.newPage();

        await page.goto(adminUrl, { waitUntil: 'domcontentloaded' });

        const before = adminPageState(await observeAdminPage(page, adminUrl));
        const after = before.kind === 'sign-in' && !before.captcha
            ? adminPageState(await submitSignIn(page, adminUrl, credentials))
            : before;
        const failure = signInFailure(after, adminUrl);

        if (failure !== undefined) {
            throw new Error(failure);
        }

        return await context.storageState();
    } finally {
        await context.close();
    }
}

/** Fills the sign-in form, sends it, and answers with the page the admin answered with. */
async function submitSignIn(page: Page, adminUrl: string, credentials: AdminCredentials): Promise<AdminPageObservation> {
    const form = page.locator(ADMIN_MARKUP.signInForm);

    await form.evaluate((element, values) => {
        const fill = (selector: string, value: string): void => {
            const input = element.querySelector(selector);

            if (!(input instanceof HTMLInputElement)) {
                throw new Error(`The admin's sign-in form has no field ${selector}.`);
            }

            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        fill(values.userField, values.username);
        fill(values.passwordField, values.password);
    }, {
        userField: ADMIN_MARKUP.userName,
        passwordField: ADMIN_MARKUP.password,
        username: credentials.username,
        password: credentials.password,
    });

    const answered = page.waitForEvent('domcontentloaded');

    await form.locator(ADMIN_MARKUP.signIn).first().click();
    await answered;

    return observeAdminPage(page, adminUrl);
}
