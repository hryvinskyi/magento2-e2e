"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminSession = void 0;
exports.signInToAdmin = signInToAdmin;
const admin_markup_1 = require("./admin-markup");
const admin_observation_1 = require("./admin-observation");
const admin_page_state_1 = require("./admin-page-state");
/**
 * The admin session of one worker: signed in on the first test that asks for it, then handed to every
 * later test of the worker. It is kept in memory only, never written to a file.
 *
 * A sign-in that fails is not tried again: every later test of the worker fails with the same reason,
 * because each further attempt with a wrong password brings the user closer to being locked.
 */
class AdminSession {
    signIn;
    signedIn;
    constructor(signIn) {
        this.signIn = signIn;
    }
    /** The session's cookies and storage; the first call signs in. */
    storageState() {
        this.signedIn ??= this.signIn();
        return this.signedIn;
    }
}
exports.AdminSession = AdminSession;
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
async function signInToAdmin(browser, { adminUrl, credentials }) {
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        await page.goto(adminUrl, { waitUntil: 'domcontentloaded' });
        const before = (0, admin_page_state_1.adminPageState)(await (0, admin_observation_1.observeAdminPage)(page, adminUrl));
        const after = before.kind === 'sign-in' && !before.captcha
            ? (0, admin_page_state_1.adminPageState)(await submitSignIn(page, adminUrl, credentials))
            : before;
        const failure = (0, admin_page_state_1.signInFailure)(after, adminUrl);
        if (failure !== undefined) {
            throw new Error(failure);
        }
        return await context.storageState();
    }
    finally {
        await context.close();
    }
}
/** Fills the sign-in form, sends it, and answers with the page the admin answered with. */
async function submitSignIn(page, adminUrl, credentials) {
    const form = page.locator(admin_markup_1.ADMIN_MARKUP.signInForm);
    await form.evaluate((element, values) => {
        const fill = (selector, value) => {
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
        userField: admin_markup_1.ADMIN_MARKUP.userName,
        passwordField: admin_markup_1.ADMIN_MARKUP.password,
        username: credentials.username,
        password: credentials.password,
    });
    const answered = page.waitForEvent('domcontentloaded');
    await form.locator(admin_markup_1.ADMIN_MARKUP.signIn).first().click();
    await answered;
    return (0, admin_observation_1.observeAdminPage)(page, adminUrl);
}
