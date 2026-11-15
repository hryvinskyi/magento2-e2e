import { expect, test } from '@playwright/test';
import { adminPageState, sessionEnd, signInFailure } from '../../src/admin/admin-page-state';
import type { AdminPageObservation, AdminPageState } from '../../src/admin/admin-page-state';

const ADMIN = 'https://shop.test/backoffice/';

function observed(overrides: Partial<AdminPageObservation> = {}): AdminPageObservation {
    return { url: `${ADMIN}admin/dashboard/index/`, route: 'admin/dashboard/index', signInForm: false, captcha: false, signInError: false, ...overrides };
}

test.describe('where a browser stands in the admin', () => {
    test('signed in on a page of the admin without the sign-in form', () => {
        expect(adminPageState(observed())).toEqual({ kind: 'signed-in' });
        expect(adminPageState(observed({ route: '' }))).toEqual({ kind: 'signed-in' });
    });

    test('at the sign-in form, with what it shows', () => {
        expect(adminPageState(observed({ signInForm: true }))).toEqual({ kind: 'sign-in', captcha: false, refused: false });
        expect(adminPageState(observed({ signInForm: true, captcha: true, signInError: true })))
            .toEqual({ kind: 'sign-in', captcha: true, refused: true });
    });

    test('a CAPTCHA or an error outside a sign-in form does not count', () => {
        expect(adminPageState(observed({ captcha: true, signInError: true }))).toEqual({ kind: 'signed-in' });
    });

    test('at the two-factor authentication', () => {
        expect(adminPageState(observed({ route: 'tfa/tfa/index' }))).toEqual({ kind: 'two-factor' });
        expect(adminPageState(observed({ route: 'tfa' }))).toEqual({ kind: 'two-factor' });
        expect(adminPageState(observed({ route: 'tfaudit/report/index' }))).toEqual({ kind: 'signed-in' });
    });

    test('elsewhere, naming the address without its query', () => {
        expect(adminPageState(observed({ url: 'https://login.example.com/sso?user=someone', route: undefined })))
            .toEqual({ kind: 'elsewhere', address: 'https://login.example.com/sso' });
    });
});

test.describe('why a sign-in did not reach the admin', () => {
    test('is nothing once it did', () => {
        expect(signInFailure({ kind: 'signed-in' }, ADMIN)).toBeUndefined();
    });

    const failures: readonly (readonly [AdminPageState, string])[] = [
        [{ kind: 'sign-in', captcha: false, refused: true }, `The admin at ${ADMIN} refused the sign-in: E2E_ADMIN_USER or E2E_ADMIN_PASSWORD is wrong`],
        [{ kind: 'sign-in', captcha: false, refused: false }, `The admin at ${ADMIN} refused the sign-in without saying why`],
        [{ kind: 'sign-in', captcha: true, refused: true }, 'asks for a CAPTCHA at sign-in, which a test cannot answer'],
        [{ kind: 'two-factor' }, 'disable the module Magento_TwoFactorAuth on this environment'],
        [{ kind: 'elsewhere', address: 'https://login.example.com/sso' }, 'ended at https://login.example.com/sso, outside it'],
        [{ kind: 'elsewhere', address: 'https://shop.test/index.php/backoffice/' }, 'give that address as adminUrl'],
    ];

    for (const [state, reason] of failures) {
        test(`names the remedy for ${JSON.stringify(state)}`, () => {
            expect(signInFailure(state, ADMIN)).toContain(reason);
        });
    }
});

test.describe('why a page of a signed-in test has no session', () => {
    test('is nothing on a page of the admin, and on a page outside it', () => {
        expect(sessionEnd({ kind: 'signed-in' }, ADMIN)).toBeUndefined();
        expect(sessionEnd({ kind: 'elsewhere', address: 'https://shop.test/' }, ADMIN)).toBeUndefined();
    });

    test('names account sharing and the session lifetime at the sign-in form', () => {
        const reason = sessionEnd({ kind: 'sign-in', captcha: false, refused: true }, ADMIN);

        expect(reason).toContain('admin/security/admin_account_sharing');
        expect(reason).toContain('admin/security/session_lifetime');
    });

    test('names the two-factor authentication', () => {
        expect(sessionEnd({ kind: 'two-factor' }, ADMIN)).toContain('two-factor authentication');
    });
});
