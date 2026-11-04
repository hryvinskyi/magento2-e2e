import { expect, test } from '@playwright/test';
import { isRecord, jsonOf, quotedBody, reportableMessageOf, shopReasonIn } from '../../src/test-orders/answers';

/** Reading what comes back from a request to the shop, run in Node without a shop. */

const PROOF = `1790000000.${'0123456789abcdef'.repeat(4)}`;

test.describe('a failure, fit for a report', () => {
    test('ends before the call log that lists what the request sent', () => {
        const error = new Error(`apiRequestContext.post: socket hang up\nCall log:\n  - → POST https://shop.example/\n    - cookie: session=1\n    - authorization: Basic abc\n`);

        expect(reportableMessageOf(error)).toBe('apiRequestContext.post: socket hang up');
    });

    test('has anything of a proof\'s shape replaced, wherever it stands', () => {
        expect(reportableMessageOf(new Error(`refused ${PROOF} and ${PROOF}`))).toBe('refused [proof removed] and [proof removed]');
    });

    test('keeps a message with nothing to take out', () => {
        expect(reportableMessageOf(new Error('The shop broke.'))).toBe('The shop broke.');
    });

    test('reads a thrown value that is not an error', () => {
        expect(reportableMessageOf('the shop broke')).toBe('the shop broke');
    });
});

test.describe('the shop\'s reason in an answer', () => {
    test('is the message of its REST API', () => {
        expect(shopReasonIn('{"message":"The payment method is not available."}')).toBe('The payment method is not available.');
    });

    test('is the start of a body that is not JSON: a web server\'s error page is not a reason', () => {
        expect(shopReasonIn(`<html>${'x'.repeat(5_000)}</html>`)).toHaveLength(200);
    });

    test('is the start of a JSON body that names no message', () => {
        expect(shopReasonIn('{"state":"canceled"}')).toBe('{"state":"canceled"}');
        expect(shopReasonIn('{"message":5}')).toBe('{"message":5}');
    });
});

test.describe('a body', () => {
    test('reads as nothing when it is not JSON', () => {
        expect(jsonOf('<html></html>')).toBeUndefined();
        expect(jsonOf('')).toBeUndefined();
    });

    test('reads as its JSON value', () => {
        expect(jsonOf('{"a":1}')).toEqual({ a: 1 });
        expect(jsonOf('true')).toBe(true);
    });

    test('is quoted up to 200 characters', () => {
        expect(quotedBody('x'.repeat(201))).toBe('x'.repeat(200));
        expect(quotedBody('short')).toBe('short');
    });
});

test.describe('a value', () => {
    test('is a record only as a plain object', () => {
        expect(isRecord({})).toBe(true);

        for (const value of [null, [], 'a', 1, undefined]) {
            expect(isRecord(value), String(value)).toBe(false);
        }
    });
});
