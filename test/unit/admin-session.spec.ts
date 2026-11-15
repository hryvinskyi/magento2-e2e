import { expect, test } from '@playwright/test';
import { AdminSession } from '../../src/admin/admin-session';
import type { AdminStorageState } from '../../src/admin/admin-session';

const STATE: AdminStorageState = {
    cookies: [{ name: 'admin', value: 'session', domain: 'shop.test', path: '/backoffice/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }],
    origins: [],
};

test('the session signs in on the first call only, and hands every later caller the same session', async () => {
    let signIns = 0;
    const session = new AdminSession(() => {
        signIns += 1;

        return Promise.resolve(STATE);
    });

    expect(signIns).toBe(0);
    expect(await Promise.all([session.storageState(), session.storageState()])).toEqual([STATE, STATE]);
    expect(await session.storageState()).toBe(STATE);
    expect(signIns).toBe(1);
});

test('a sign-in that failed is not tried again: every later caller gets its reason', async () => {
    let signIns = 0;
    const session = new AdminSession(() => {
        signIns += 1;

        return Promise.reject(new Error('The admin refused the sign-in.'));
    });

    await expect(session.storageState()).rejects.toThrow('The admin refused the sign-in.');
    await expect(session.storageState()).rejects.toThrow('The admin refused the sign-in.');
    expect(signIns).toBe(1);
});
