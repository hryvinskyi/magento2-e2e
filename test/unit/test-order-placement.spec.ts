import { expect, test } from '@playwright/test';
import { judgePlacement } from '../../src/test-orders/placement';

/**
 * Which order placements a test order signs and which it stops in the browser, run in Node without a
 * browser.
 */

const CART = 'Mg4w0eZ3k1qYbVt9XcLpR2sNd8HuJf6A';
const OTHER_CART = 'Zq8L1pW4nB7vC2xK9mT5rY3sD6fG0hJa';
const SHOP = 'https://shop.example';
const SECOND_ORIGIN = 'https://second.shop.example';
const TERMS = { cart: CART, shopOrigins: new Set([SHOP, SECOND_ORIGIN]), storePaths: new Set(['/', '/fr/']) };
const PLACEMENT_URL = `${SHOP}/rest/main/V1/guest-carts/${CART}/payment-information`;
const NOT_A_PLACEMENT = 'a test order is placed only through a guest cart\'s payment-information call';

/** The body the checkout sends with a placement. */
function placementBody(): string {
    return JSON.stringify({
        cartId: CART,
        email: 'e2e+order@shop.test',
        paymentMethod: { method: 'checkmo' },
    });
}

test.describe('a test order placement', () => {
    test('is signed for the test\'s own guest cart, sent to the shop', () => {
        expect(judgePlacement({ method: 'POST', url: PLACEMENT_URL, body: placementBody() }, TERMS))
            .toEqual({ kind: 'sign', maskedCartId: CART });
    });

    test('lets a read of the same address through untouched', () => {
        expect(judgePlacement({ method: 'GET', url: PLACEMENT_URL, body: null }, TERMS)).toEqual({ kind: 'pass' });
    });

    test('is stopped when it goes to a host that is not the shop', () => {
        const elsewhere = `${SHOP}.attacker.test/rest/main/V1/guest-carts/${CART}/payment-information`;

        expect(judgePlacement({ method: 'POST', url: elsewhere, body: placementBody() }, TERMS))
            .toMatchObject({ kind: 'refuse', reason: expect.stringContaining('not the shop') });
    });

    test('is stopped for any cart but the one the test built', () => {
        const otherCart = `${SHOP}/rest/main/V1/guest-carts/${OTHER_CART}/payment-information`;

        expect(judgePlacement({ method: 'POST', url: otherCart, body: placementBody() }, TERMS))
            .toMatchObject({ kind: 'refuse', reason: expect.stringContaining(`not for cart ${CART}`) });
    });

    test('is stopped for a signed-in customer\'s cart and for the order call', () => {
        for (const url of [`${SHOP}/rest/main/V1/carts/mine/payment-information`, `${SHOP}/rest/main/V1/guest-carts/${CART}/order`]) {
            expect(judgePlacement({ method: 'POST', url, body: placementBody() }, TERMS), url).toMatchObject({ kind: 'refuse' });
        }

        expect(judgePlacement({ method: 'PUT', url: PLACEMENT_URL, body: placementBody() }, TERMS)).toMatchObject({ kind: 'refuse' });
    });

    test('is stopped when its body cannot be read', () => {
        for (const body of [null, '', 'cartId=1', '[1]']) {
            expect(judgePlacement({ method: 'POST', url: PLACEMENT_URL, body }, TERMS), String(body)).toMatchObject({ kind: 'refuse' });
        }
    });
});

test.describe('the address of a test order placement', () => {
    const STORE_FORMS = [
        { form: 'with a store code', prefix: '/rest/main/V1' },
        { form: 'below a store\'s path', prefix: '/fr/rest/fr/V1' },
        { form: 'without a store code', prefix: '/rest/V1' },
    ];

    for (const { form, prefix } of STORE_FORMS) {
        test(`is signed ${form}`, () => {
            const url = `${SHOP}${prefix}/guest-carts/${CART}/payment-information`;

            expect(judgePlacement({ method: 'POST', url, body: placementBody() }, TERMS)).toEqual({ kind: 'sign', maskedCartId: CART });
        });

        test(`is stopped for a signed-in customer's cart ${form}`, () => {
            const url = `${SHOP}${prefix}/carts/mine/payment-information`;

            expect(judgePlacement({ method: 'POST', url, body: placementBody() }, TERMS))
                .toMatchObject({ kind: 'refuse', reason: expect.stringContaining(NOT_A_PLACEMENT) });
        });
    }

    test('is signed on any of the shop\'s origins', () => {
        const url = `${SECOND_ORIGIN}/rest/main/V1/guest-carts/${CART}/payment-information`;

        expect(judgePlacement({ method: 'POST', url, body: placementBody() }, TERMS)).toEqual({ kind: 'sign', maskedCartId: CART });
    });

    test('is stopped below a path that is no store\'s, with the store code or without', () => {
        for (const path of [`/anything/rest/V1/guest-carts/${CART}/payment-information`, `/de/rest/de/V1/guest-carts/${CART}/payment-information`]) {
            expect(judgePlacement({ method: 'POST', url: `${SHOP}${path}`, body: placementBody() }, TERMS), path)
                .toMatchObject({ kind: 'refuse', reason: expect.stringContaining(NOT_A_PLACEMENT) });
        }
    });

    test('is stopped when another address of the REST API merely ends in it', () => {
        const doubled = `${SHOP}/rest/main/V1/guest-carts/${OTHER_CART}/rest/V1/guest-carts/${CART}/payment-information`;

        expect(judgePlacement({ method: 'POST', url: doubled, body: placementBody() }, TERMS))
            .toMatchObject({ kind: 'refuse', reason: expect.stringContaining(NOT_A_PLACEMENT) });
    });

    test('never reads the version of the API as a store code', () => {
        const url = `${SHOP}/rest/V1/V1/guest-carts/${CART}/payment-information`;

        expect(judgePlacement({ method: 'POST', url, body: placementBody() }, TERMS))
            .toMatchObject({ kind: 'refuse', reason: expect.stringContaining(NOT_A_PLACEMENT) });
    });

    test('never reads the asynchronous API as a store code: what it queues reaches a consumer without a proof', () => {
        const url = `${SHOP}/rest/async/V1/guest-carts/${CART}/payment-information`;

        expect(judgePlacement({ method: 'POST', url, body: placementBody() }, TERMS))
            .toMatchObject({ kind: 'refuse', reason: expect.stringContaining(NOT_A_PLACEMENT) });
    });

    test('is refused, naming the address, when its cart segment is no valid escape', () => {
        const url = `${SHOP}/rest/main/V1/guest-carts/%E0%A4%A/payment-information`;

        expect(judgePlacement({ method: 'POST', url, body: placementBody() }, TERMS))
            .toMatchObject({ kind: 'refuse', reason: expect.stringContaining(url) });
    });

    test('is judged without its query', () => {
        expect(judgePlacement({ method: 'POST', url: `${PLACEMENT_URL}?form_key=1`, body: placementBody() }, TERMS))
            .toEqual({ kind: 'sign', maskedCartId: CART });
    });
});

test.describe('a project\'s own refusal of a placement', () => {
    /** A refusal that keeps what it was asked and answers `answer`. */
    function recordingRefusal(answer: string | undefined): {
        readonly asked: unknown[];
        readonly refusal: (body: Readonly<Record<string, unknown>>) => string | undefined;
    } {
        const asked: unknown[] = [];

        return {
            asked,
            refusal: body => {
                asked.push(body);

                return answer;
            },
        };
    }

    test('receives the parsed body', () => {
        const { asked, refusal } = recordingRefusal(undefined);

        judgePlacement({ method: 'POST', url: PLACEMENT_URL, body: placementBody() }, { ...TERMS, refusal });

        expect(asked).toEqual([{ cartId: CART, email: 'e2e+order@shop.test', paymentMethod: { method: 'checkmo' } }]);
    });

    test('stops the placement with the reason it answers', () => {
        const { refusal } = recordingRefusal('the placement carries a side effect');

        expect(judgePlacement({ method: 'POST', url: PLACEMENT_URL, body: placementBody() }, { ...TERMS, refusal }))
            .toEqual({ kind: 'refuse', reason: 'the placement carries a side effect' });
    });

    test('lets the placement be signed when it answers nothing', () => {
        const { refusal } = recordingRefusal(undefined);

        expect(judgePlacement({ method: 'POST', url: PLACEMENT_URL, body: placementBody() }, { ...TERMS, refusal }))
            .toEqual({ kind: 'sign', maskedCartId: CART });
    });

    test('stops the placement with its message when it throws', () => {
        const refusal = (): string => {
            throw new Error('the project could not read the body');
        };

        expect(judgePlacement({ method: 'POST', url: PLACEMENT_URL, body: placementBody() }, { ...TERMS, refusal }))
            .toEqual({ kind: 'refuse', reason: 'the project could not read the body' });
    });

    test('is not asked about a body that is not a JSON object', () => {
        const { asked, refusal } = recordingRefusal(undefined);

        for (const body of [null, '', 'cartId=1', '[1]']) {
            expect(judgePlacement({ method: 'POST', url: PLACEMENT_URL, body }, { ...TERMS, refusal }), String(body)).toMatchObject({ kind: 'refuse' });
        }

        expect(asked).toEqual([]);
    });

    test('is not asked about another cart', () => {
        const { asked, refusal } = recordingRefusal(undefined);
        const otherCart = `${SHOP}/rest/main/V1/guest-carts/${OTHER_CART}/payment-information`;

        judgePlacement({ method: 'POST', url: otherCart, body: placementBody() }, { ...TERMS, refusal });

        expect(asked).toEqual([]);
    });

    test('is not asked about another origin', () => {
        const { asked, refusal } = recordingRefusal(undefined);
        const elsewhere = `${SHOP}.attacker.test/rest/main/V1/guest-carts/${CART}/payment-information`;

        judgePlacement({ method: 'POST', url: elsewhere, body: placementBody() }, { ...TERMS, refusal });

        expect(asked).toEqual([]);
    });
});
