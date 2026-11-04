import { expect, test } from '@playwright/test';
import { mayLeave } from '../../src/storefront/write-guard';

const shop: ReadonlySet<string> = new Set(['https://www.example.com', 'https://shop.example.com']);

test.describe('a guarded run', () => {
    test('lets every read leave, wherever it goes', () => {
        expect(mayLeave('GET', 'https://payments.example.net/session', shop)).toBe(true);
        expect(mayLeave('head', 'https://cdn.example.org/script.js', shop)).toBe(true);
    });

    test('lets a write leave for the shop\'s own origins, whatever the path', () => {
        expect(mayLeave('POST', 'https://www.example.com/rest/V1/guest-carts/abc/payment-information', shop)).toBe(true);
        expect(mayLeave('put', 'https://shop.example.com/fr/checkout/update?x=1', shop)).toBe(true);
    });

    test('refuses a write anywhere else, a sibling host or another port of the shop included', () => {
        expect(mayLeave('POST', 'https://payments.example.net/v1/charge', shop)).toBe(false);
        expect(mayLeave('DELETE', 'https://partner.example.org/session', shop)).toBe(false);
        expect(mayLeave('POST', 'https://example.com/rest/V1/carts/mine', shop)).toBe(false);
        expect(mayLeave('POST', 'https://www.example.com:8443/', shop)).toBe(false);
        expect(mayLeave('POST', 'http://www.example.com/', shop)).toBe(false);
    });

    test('counts a socket as a write to the origin it opens from', () => {
        expect(mayLeave('GET', 'wss://events.example.net/socket', new Set())).toBe(true);
        expect(mayLeave('POST', 'wss://www.example.com/socket', shop)).toBe(true);
        expect(mayLeave('POST', 'ws://www.example.com/socket', shop)).toBe(false);
        expect(mayLeave('POST', 'ws://shop.test/socket', new Set(['http://shop.test']))).toBe(true);
        expect(mayLeave('POST', 'wss://events.example.net/socket', shop)).toBe(false);
    });
});
