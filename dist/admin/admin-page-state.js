"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPageState = adminPageState;
exports.signInFailure = signInFailure;
exports.sessionEnd = sessionEnd;
/** The route Magento's two-factor authentication holds a signed-in admin user at until it is answered. */
const TWO_FACTOR_ROUTE = /^tfa(\/|$)/;
/** Reads where the browser stands from what it shows. */
function adminPageState(observation) {
    if (observation.route === undefined) {
        const { origin, pathname } = new URL(observation.url);
        return { kind: 'elsewhere', address: `${origin}${pathname}` };
    }
    if (observation.signInForm) {
        return { kind: 'sign-in', captcha: observation.captcha, refused: observation.signInError };
    }
    return TWO_FACTOR_ROUTE.test(observation.route) ? { kind: 'two-factor' } : { kind: 'signed-in' };
}
/**
 * Why a sign-in did not reach the admin. None of them names the user or the password: they reach the
 * report, which is read outside the team.
 */
const SIGN_IN_FAILURES = {
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
const SESSION_ENDS = {
    'sign-in': (_state, adminUrl) => `The admin session ended: the admin at ${adminUrl} shows its sign-in form. A second `
        + 'sign-in of the same admin user ends the first one unless admin/security/admin_account_sharing is on, so turn '
        + 'it on for this environment or run the admin tests in one worker; a session also ends after '
        + 'admin/security/session_lifetime without use.',
    'two-factor': (_state, adminUrl) => `The admin at ${adminUrl} stopped the session at its two-factor authentication.`,
    elsewhere: () => undefined,
};
/** Why a sign-in did not reach the admin; nothing when it did. */
function signInFailure(state, adminUrl) {
    return state.kind === 'signed-in' ? undefined : reasonFor(SIGN_IN_FAILURES, state, adminUrl);
}
/** Why a page of a signed-in test shows the admin without its session; nothing while the session holds. */
function sessionEnd(state, adminUrl) {
    return state.kind === 'signed-in' ? undefined : reasonFor(SESSION_ENDS, state, adminUrl);
}
/** Hands a state to the words of its kind. */
function reasonFor(reasons, state, adminUrl) {
    return reasons[state.kind](state, adminUrl);
}
