import type { Browser, BrowserContext } from '@playwright/test';
import type { AdminCredentials } from '../environment/environment';
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
export declare class AdminSession {
    private readonly signIn;
    private signedIn;
    constructor(signIn: AdminSignIn);
    /** The session's cookies and storage; the first call signs in. */
    storageState(): Promise<AdminStorageState>;
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
export declare function signInToAdmin(browser: Browser, { adminUrl, credentials }: AdminSignInTarget): Promise<AdminStorageState>;
