import { expect, test } from '@playwright/test';
import {
    MINIMUM_SECRET_BYTES,
    RECOGNITION_SUBJECT,
    signTestOrderProof,
    TEST_ORDER_ACTIONS,
    TEST_ORDER_PROOF_HEADER,
    TestOrderProofs,
} from '../../src/test-orders/proof';
import type { TestOrderAction } from '../../src/test-orders/proof';

/**
 * The runner's proof is checked by the shop, in PHP; these specs run the signer in Node, without a
 * browser. The expected signatures were made with PHP's
 * `hash_hmac('sha256', '<action>|<subject>|<seconds>', $secret)`, the call the shop verifies with, so a
 * signer that drifts from the shop's format — another order of the parts, another separator — goes red.
 */

const SECRET = 'e2e-proof-spec-secret-0123456789abcdef';
const MASKED_CART_ID = 'Mg4w0eZ3k1qYbVt9XcLpR2sNd8HuJf6A';
const SECONDS = 1_790_000_000;

/** The shape the shop accepts, and nothing around it. */
const PROOF_SHAPE = /^[1-9]\d{9}\.[0-9a-f]{64}$/;

test.describe('the runner\'s proof that it placed a test order', () => {
    test('for placing an order is the time and the shop\'s HMAC of the action, the cart and that time', () => {
        expect(signTestOrderProof(SECRET, 'place', MASKED_CART_ID, SECONDS))
            .toBe('1790000000.c8ba3b61b02867cb9452aa6cc895249304830e7214ff8e2c16baa92e427d205b');
    });

    test('for abandoning the order of the same cart is another proof', () => {
        expect(signTestOrderProof(SECRET, 'abandon', MASKED_CART_ID, SECONDS))
            .toBe('1790000000.03634060081066b234fe4f621c1a7ea2a16ab14f4c134f66f34cc90a05727edd');
    });

    test('for the recognition probe is made over the probe\'s own subject', () => {
        expect(signTestOrderProof(SECRET, 'recognise', RECOGNITION_SUBJECT, SECONDS))
            .toBe('1790000000.6f4fa6428dd1c06bbdbd627d10174eb06d3d633415dd67a63ef79f841dac2611');
    });

    test('is not the shop\'s HMAC of the same parts in another order', () => {
        // PHP's hash_hmac over '<cart>|place|<seconds>': what a signer that swapped the parts would send.
        expect(signTestOrderProof(SECRET, 'place', MASKED_CART_ID, SECONDS))
            .not.toBe('1790000000.791026baef352dc760808a4229068c9bcc4b03ed506b6283a55c44f4a633a700');
    });

    test('has exactly the shape the shop accepts, for every action', () => {
        for (const action of TEST_ORDER_ACTIONS) {
            expect(signTestOrderProof(SECRET, action, MASKED_CART_ID, SECONDS), action).toMatch(PROOF_SHAPE);
        }
    });

    test('differs for another action, another cart, another time and another secret', () => {
        const proof = signTestOrderProof(SECRET, 'place', MASKED_CART_ID, SECONDS);
        const signatureOf = (value: string): string | undefined => value.split('.')[1];

        expect(signTestOrderProof(SECRET, 'abandon', MASKED_CART_ID, SECONDS)).not.toBe(proof);
        expect(signTestOrderProof(SECRET, 'place', `${MASKED_CART_ID}x`, SECONDS)).not.toBe(proof);
        expect(signatureOf(signTestOrderProof(SECRET, 'place', MASKED_CART_ID, SECONDS + 1))).not.toBe(signatureOf(proof));
        expect(signTestOrderProof(`${SECRET}x`, 'place', MASKED_CART_ID, SECONDS)).not.toBe(proof);
    });

    test('is refused for an action the shop does not know', () => {
        // A caller outside the type system (a value read from a file, say) can still name one.
        const unknownAction = 'probe' as TestOrderAction;

        expect(() => signTestOrderProof(SECRET, unknownAction, MASKED_CART_ID, SECONDS)).toThrow(RangeError);
    });

    test('is refused for a secret shorter than the shop accepts', () => {
        const shortSecret = 'k'.repeat(MINIMUM_SECRET_BYTES - 1);

        expect(() => signTestOrderProof(shortSecret, 'place', MASKED_CART_ID, SECONDS)).toThrow(RangeError);
        expect(signTestOrderProof('k'.repeat(MINIMUM_SECRET_BYTES), 'place', MASKED_CART_ID, SECONDS)).toMatch(PROOF_SHAPE);
    });

    test('counts the secret in bytes, as the shop does', () => {
        // Sixteen two-byte characters: 32 bytes, although only 16 characters.
        expect(signTestOrderProof('é'.repeat(16), 'place', MASKED_CART_ID, SECONDS)).toMatch(PROOF_SHAPE);
        expect(() => signTestOrderProof('é'.repeat(15), 'place', MASKED_CART_ID, SECONDS)).toThrow(RangeError);
    });

    test('is refused without a subject, or with one that holds the separator of the signed message', () => {
        expect(() => signTestOrderProof(SECRET, 'place', '', SECONDS)).toThrow(RangeError);
        expect(() => signTestOrderProof(SECRET, 'place', `${MASKED_CART_ID}|abandon`, SECONDS)).toThrow(RangeError);
    });

    test('is refused for a time the shop cannot read as ten digits of unix seconds', () => {
        for (const seconds of [999_999_999, 10_000_000_000, 1_790_000_000.5, -SECONDS, Number.NaN]) {
            expect(() => signTestOrderProof(SECRET, 'place', MASKED_CART_ID, seconds), String(seconds)).toThrow(RangeError);
        }
    });

    test('travels in the header the shop reads, made at the time of the clock it was given', () => {
        const proofs = new TestOrderProofs(SECRET, () => SECONDS);

        expect(proofs.headersFor('abandon', MASKED_CART_ID)).toEqual({
            [TEST_ORDER_PROOF_HEADER]: signTestOrderProof(SECRET, 'abandon', MASKED_CART_ID, SECONDS),
        });
        expect(TEST_ORDER_PROOF_HEADER).toBe('X-Test-Order-Proof');
    });

    test('is made anew for every request, at the clock\'s current time', () => {
        let now = SECONDS;
        const proofs = new TestOrderProofs(SECRET, () => now);
        const first = proofs.proofFor('place', MASKED_CART_ID);

        now += 60;

        expect(proofs.proofFor('place', MASKED_CART_ID)).toBe(signTestOrderProof(SECRET, 'place', MASKED_CART_ID, SECONDS + 60));
        expect(proofs.proofFor('place', MASKED_CART_ID)).not.toBe(first);
    });
});
