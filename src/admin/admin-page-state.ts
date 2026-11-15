/** The route Magento's two-factor authentication holds a signed-in admin user at until it is answered. */
const TWO_FACTOR_ROUTE = /^tfa(\/|$)/;

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
    | { readonly kind: 'signed-in' }
    /** The sign-in form: on the first visit, after a refused sign-in, or once a session has ended. */
    | { readonly kind: 'sign-in'; readonly captcha: boolean; readonly refused: boolean }
    /** Magento's two-factor authentication, which holds the user until a second factor is given. */
    | { readonly kind: 'two-factor' }
    /**
     * An address that is not below the admin's: a sign-in handed to another site, a redirect away, or an
     * admin the shop serves at another address than the project says. The address has no query, which
     * may carry a token.
     */
    | { readonly kind: 'elsewhere'; readonly address: string };

/** Reads where the browser stands from what it shows. */
export function adminPageState(observation: AdminPageObservation): AdminPageState {
    if (observation.route === undefined) {
        const { origin, pathname } = new URL(observation.url);

        return { kind: 'elsewhere', address: `${origin}${pathname}` };
    }

    if (observation.signInForm) {
        return { kind: 'sign-in', captcha: observation.captcha, refused: observation.signInError };
    }

    return TWO_FACTOR_ROUTE.test(observation.route) ? { kind: 'two-factor' } : { kind: 'signed-in' };
}

type NotSignedIn = Exclude<AdminPageState, { readonly kind: 'signed-in' }>;

type NotSignedInKind = NotSignedIn['kind'];

type NotSignedInOf<K extends NotSignedInKind> = Extract<NotSignedIn, { readonly kind: K }>;

/** What is said of a browser that is not signed in, per where it stands, given the admin's address. */
type Reasons<R, K extends NotSignedInKind = NotSignedInKind> = {
    readonly [P in K]: (state: NotSignedInOf<P>, adminUrl: string) => R;
};

/**
 * Why a sign-in did not reach the admin. None of them names the user or the password: they reach the
 * report, which is read outside the team.
 */
const SIGN_IN_FAILURES: Reasons<string> = {
    'sign-in': ({ captcha, refused }, adminUrl) => (captcha
        ? `The admin at ${adminUrl} asks for a CAPTCHA at sign-in, which a test cannot answer: switch the admin's `
            + 'CAPTCHA off on this environment (admin/captcha/enable = 0, or leave backend_login out of admin/captcha/forms). '
            + 'It also appears after failed sign-ins: check E2E_ADMIN_USER and E2E_ADMIN_PASSWORD.'
        : `The admin at ${adminUrl} refused the sign-in${refused ? '' : ' without saying why'}: E2E_ADMIN_USER or `
            + 'E2E_ADMIN_PASSWORD is wrong, the user is inactive or locked after failed sign-ins, or a CAPTCHA the page '
            + 'does not show refused it.'),
    'two-factor': (_state, adminUrl) => `The admin at ${adminUrl} holds the sign-in at its two-factor authentication, which `
        + 'a test cannot answer: disable the module Magento_TwoFactorAuth on this environment, or set the admin user up '
        + 'for a provider the run can answer.',
    elsewhere: ({ address }, adminUrl) => `The sign-in to the admin at ${adminUrl} ended at ${address}, outside it. `
        + 'Where that is the admin, at an address of the shop\'s own choosing, give that address as adminUrl. A sign-in '
        + 'handed to another site cannot be scripted: let the admin user sign in with its own password on this environment.',
};

/**
 * Why a test that should be signed in is not; a page outside the admin, where a link the test followed
 * leads, is not a session that ended. A session ends when the same admin user signs in elsewhere, which
 * another worker of the run does unless the shop allows account sharing, and when it is left unused for
 * longer than the shop's session lifetime.
 */
const SESSION_ENDS: Reasons<string | undefined> = {
    'sign-in': (_state, adminUrl) => `The admin session ended: the admin at ${adminUrl} shows its sign-in form. A second `
        + 'sign-in of the same admin user ends the first one unless admin/security/admin_account_sharing is on, so turn '
        + 'it on for this environment or run the admin tests in one worker; a session also ends after '
        + 'admin/security/session_lifetime without use.',
    'two-factor': (_state, adminUrl) => `The admin at ${adminUrl} stopped the session at its two-factor authentication.`,
    elsewhere: () => undefined,
};

/** Why a sign-in did not reach the admin; nothing when it did. */
export function signInFailure(state: AdminPageState, adminUrl: string): string | undefined {
    return state.kind === 'signed-in' ? undefined : reasonFor(SIGN_IN_FAILURES, state, adminUrl);
}

/** Why a page of a signed-in test shows the admin without its session; nothing while the session holds. */
export function sessionEnd(state: AdminPageState, adminUrl: string): string | undefined {
    return state.kind === 'signed-in' ? undefined : reasonFor(SESSION_ENDS, state, adminUrl);
}

/** Hands a state to the words of its kind. */
function reasonFor<R, K extends NotSignedInKind>(reasons: Reasons<R, K>, state: NotSignedInOf<K>, adminUrl: string): R {
    return reasons[state.kind](state, adminUrl);
}
