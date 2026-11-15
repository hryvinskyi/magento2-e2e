/** What the browser shows of an admin page, read by `observeAdminPage()`. */
export interface AdminPageObservation {
    /** The page's address. */
    readonly url: string;
    /** The page's route below the admin's address, without the secret key; nothing when the page left the admin. */
    readonly route: string | undefined;
    /** Whether the page shows the admin's sign-in form. */
    readonly signInForm: boolean;
    /** Whether the sign-in form asks for a CAPTCHA. */
    readonly captcha: boolean;
    /** Whether the sign-in form shows an error, as it does after a refused sign-in. */
    readonly signInError: boolean;
}
/** Where a browser stands in the admin. */
export type AdminPageState = 
/** A page of the signed-in admin. */
{
    readonly kind: 'signed-in';
}
/** The sign-in form: on the first visit, after a refused sign-in, or once a session has ended. */
 | {
    readonly kind: 'sign-in';
    readonly captcha: boolean;
    readonly refused: boolean;
}
/** Magento's two-factor authentication, which holds the user until a second factor is given. */
 | {
    readonly kind: 'two-factor';
}
/**
 * An address that is not below the admin's: a sign-in handed to another site, a redirect away, or an
 * admin the shop serves at another address than the project says. The address has no query, which
 * may carry a token.
 */
 | {
    readonly kind: 'elsewhere';
    readonly address: string;
};
/** Reads where the browser stands from what it shows. */
export declare function adminPageState(observation: AdminPageObservation): AdminPageState;
/** Why a sign-in did not reach the admin; nothing when it did. */
export declare function signInFailure(state: AdminPageState, adminUrl: string): string | undefined;
/** Why a page of a signed-in test shows the admin without its session; nothing while the session holds. */
export declare function sessionEnd(state: AdminPageState, adminUrl: string): string | undefined;
