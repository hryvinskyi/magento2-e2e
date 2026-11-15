import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { Admin } from '../../src/admin/admin';
import { signInToAdmin } from '../../src/admin/admin-session';
import type { AdminStorageState } from '../../src/admin/admin-session';
import type { AdminCredentials } from '../../src/environment/environment';
import { FakeAdmin } from './admin-server';
import type { FakeAdminOptions } from './admin-server';

const USER = 'e2e-admin-user';
const PASSWORD = 'pw-0a1b2c3d4e5f';
const CREDENTIALS: AdminCredentials = { username: USER, password: PASSWORD };

const started: FakeAdmin[] = [];

test.afterEach(async () => {
    await Promise.all(started.splice(0).map(admin => admin.stop()));
});

async function fakeAdmin(options: Partial<FakeAdminOptions> = {}): Promise<FakeAdmin> {
    const admin = await FakeAdmin.start({ username: USER, password: PASSWORD, ...options });

    started.push(admin);

    return admin;
}

/** Signs in to the fake admin and opens a page of a new context with the session. */
async function signedIn(browser: Browser, fake: FakeAdmin): Promise<Admin> {
    const state: AdminStorageState = await signInToAdmin(browser, { adminUrl: fake.adminUrl, credentials: CREDENTIALS });
    const context = await browser.newContext({ storageState: state });

    return new Admin(await context.newPage(), fake.adminUrl);
}

/** The reason a sign-in was refused for. */
async function refusalOf(browser: Browser, fake: FakeAdmin, credentials: AdminCredentials = CREDENTIALS): Promise<string> {
    try {
        await signInToAdmin(browser, { adminUrl: fake.adminUrl, credentials });
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }

    throw new Error('The sign-in was not refused.');
}

test.describe('signing in to the admin', () => {
    test('sends the user and the password once, through the sign-in form, and answers with the session', async ({ browser }) => {
        const fake = await fakeAdmin();
        const admin = await signedIn(browser, fake);

        await admin.open();

        expect(admin.route()).toBe('');
        await expect(admin.page.locator('[data-ui-id="menu-magento-backend-dashboard"]')).toBeVisible();
        expect(fake.signIns()).toHaveLength(1);
        expect(new URLSearchParams(fake.signIns()[0]?.body).get('login[password]')).toBe(PASSWORD);
        expect(fake.received.filter(request => request.path.includes(PASSWORD) || request.path.includes(USER))).toEqual([]);
        await admin.page.context().close();
    });

    test('closes the context it signed in with', async ({ browser }) => {
        const fake = await fakeAdmin();
        const before = browser.contexts().length;

        await signInToAdmin(browser, { adminUrl: fake.adminUrl, credentials: CREDENTIALS });

        expect(browser.contexts()).toHaveLength(before);
    });

    test('is refused with the reason when the admin refuses the credentials, naming neither of them', async ({ browser }) => {
        const fake = await fakeAdmin();
        const wrong = { username: 'someone-else', password: 'not-the-password' };
        const before = browser.contexts().length;
        const refusal = await refusalOf(browser, fake, wrong);

        expect(refusal).toContain(`The admin at ${fake.adminUrl} refused the sign-in:`);
        expect(refusal).toContain('E2E_ADMIN_USER or E2E_ADMIN_PASSWORD is wrong');
        expect(refusal).not.toContain(wrong.username);
        expect(refusal).not.toContain(wrong.password);
        expect(browser.contexts()).toHaveLength(before);
    });

    test('is refused before anything is sent when the sign-in asks for a CAPTCHA', async ({ browser }) => {
        const fake = await fakeAdmin({ captcha: true });

        expect(await refusalOf(browser, fake)).toContain('asks for a CAPTCHA at sign-in, which a test cannot answer');
        expect(fake.signIns()).toEqual([]);
    });

    test('is refused, naming the remedy, when two-factor authentication holds the user', async ({ browser }) => {
        const fake = await fakeAdmin({ afterSignIn: 'two-factor' });

        expect(await refusalOf(browser, fake)).toContain('disable the module Magento_TwoFactorAuth on this environment');
    });

    test('is refused when the sign-in ends outside the admin', async ({ browser }) => {
        const fake = await fakeAdmin({ afterSignIn: 'elsewhere' });
        const elsewhere = fake.adminUrl.replace('127.0.0.1', 'localhost');

        expect(await refusalOf(browser, fake)).toContain(`ended at ${elsewhere}, outside it.`);
    });
});

test.describe('opening admin pages', () => {
    test('an address typed by hand lands on the dashboard where addresses carry a secret key', async ({ browser }) => {
        const fake = await fakeAdmin({ secretKeys: true });
        const admin = await signedIn(browser, fake);

        await admin.page.goto(`${fake.adminUrl}catalog/product/index/`);

        expect(admin.route()).toBe('admin/dashboard/index');
        await admin.page.context().close();
    });

    test('opens a menu item by its id at the address the menu gives, with or without secret keys', async ({ browser }) => {
        for (const secretKeys of [true, false]) {
            const fake = await fakeAdmin({ secretKeys });
            const admin = await signedIn(browser, fake);

            await admin.openMenuItem('menu-magento-catalog-catalog-products');

            expect(admin.route(), `secret keys ${String(secretKeys)}`).toBe('catalog/product/index');
            expect(admin.page.url().includes('/key/'), `secret keys ${String(secretKeys)}`).toBe(secretKeys);
            await admin.page.context().close();
        }
    });

    test('refuses a menu item that only opens a submenu, one the menu does not have, and an id that is none', async ({ browser }) => {
        const fake = await fakeAdmin();
        const admin = await signedIn(browser, fake);

        await expect(admin.openMenuItem('menu-magento-catalog-catalog')).rejects.toThrow(
            'The menu item menu-magento-catalog-catalog has no address of its own (href "#")',
        );
        await expect(admin.openMenuItem('menu-acme-nothing')).rejects.toThrow('The admin menu has no item menu-acme-nothing');
        await expect(admin.openMenuItem('menu-Catalog::products')).rejects.toThrow('is not the id of an admin menu item');
        await admin.page.context().close();
    });

    test('follows a link the page shows, and reads its route without the key', async ({ browser }) => {
        const fake = await fakeAdmin({ secretKeys: true });
        const admin = await signedIn(browser, fake);

        await admin.open();
        await admin.follow(admin.page.locator('#edit-five'));

        expect(admin.route()).toBe('catalog/product/edit/id/5');
        await expect(admin.messages('success')).toHaveText('You saved the product.');
        await expect(admin.messages('error')).toHaveCount(0);
        await expect(admin.follow(admin.page.locator('#nowhere'))).rejects.toThrow('The link has no address of its own');
        await expect(admin.follow(admin.page.locator('#absent'))).rejects.toThrow('The link to follow is not on the page');
        await admin.page.context().close();
    });

    test('fails a page that shows the sign-in form, saying why a session ends', async ({ browser }) => {
        const fake = await fakeAdmin();
        const admin = await signedIn(browser, fake);

        fake.endSessions();

        await expect(admin.open()).rejects.toThrow(
            'A second sign-in of the same admin user ends the first one unless admin/security/admin_account_sharing is on',
        );
        await admin.page.context().close();
    });

    test('refuses to read the route of a page outside the admin', async ({ browser }) => {
        const fake = await fakeAdmin();
        const admin = await signedIn(browser, fake);

        await admin.page.goto('about:blank');

        expect(() => admin.route()).toThrow(`is not below the admin at ${fake.adminUrl}`);
        await admin.page.context().close();
    });
});

test.describe('the admin mechanics', () => {
    test('settled() waits until the loading masks are gone', async ({ browser }) => {
        const fake = await fakeAdmin({ gridLoadingMs: 1_000 });
        const admin = await signedIn(browser, fake);

        await admin.openMenuItem('menu-magento-catalog-catalog-products');
        await expect(admin.page.locator('[data-role="spinner"]')).toBeVisible();
        await admin.settled();

        await expect(admin.page.locator('[data-role="spinner"]')).toBeHidden({ timeout: 1 });
        await admin.page.context().close();
    });

    test('the page\'s form key lets a request of the test\'s own through, and nothing else does', async ({ browser }) => {
        const fake = await fakeAdmin();
        const admin = await signedIn(browser, fake);

        await admin.open();

        const save = `${fake.adminUrl}catalog/product/save/`;
        const formKey = await admin.formKey();
        const accepted = await admin.page.request.post(save, { form: { form_key: formKey } });
        const refused = await admin.page.request.post(save, { form: { form_key: 'guessed' } });

        expect(formKey).toMatch(/^form-key-/);
        expect(accepted.status()).toBe(200);
        expect(refused.status()).toBe(403);
        await admin.page.context().close();
    });

    test('a page without a form key is refused', async ({ browser }) => {
        const fake = await fakeAdmin();
        const admin = await signedIn(browser, fake);

        await admin.page.goto(`${fake.adminUrl}admin/blank/index/`);

        await expect(admin.formKey()).rejects.toThrow('The admin page admin/blank/index holds no form key.');
        await admin.page.context().close();
    });
});
