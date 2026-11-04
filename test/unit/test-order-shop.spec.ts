import { expect, test } from '@playwright/test';
import { RECOGNITION_SUBJECT, signTestOrderProof, TEST_ORDER_PROOF_HEADER, TestOrderProofs } from '../../src/test-orders/proof';
import { parseAbandonedTestOrder, TestOrderContractError, TestOrders } from '../../src/test-orders/shop';
import type { ShopAnswer, ShopRequestOptions, ShopRequests } from '../../src/test-orders/shop';

/**
 * The runner's client of the shop's test-order surface, run in Node against a recording fake of the
 * shop: which URL it asks, with which proof and deadline, and how it reads each answer.
 */

const SECRET = 'e2e-orders-spec-secret-0123456789abcdef';
const SECONDS = 1_790_000_000;
const REST_BASE = 'https://shop.example/rest/main/V1/';
const MASKED_CART_ID = 'Mg4w0eZ3k1qYbVt9XcLpR2sNd8HuJf6A';

interface SentRequest {
    readonly url: string;
    readonly options: ShopRequestOptions;
}

/** A shop that answers every request with the same status and body, and keeps what it was sent. */
class RecordingShop implements ShopRequests {
    public readonly sent: SentRequest[] = [];
    private readonly answer: ShopAnswer;

    public constructor(status: number, body: string) {
        this.answer = { status: () => status, text: () => Promise.resolve(body) };
    }

    public post(url: string, options: ShopRequestOptions): Promise<ShopAnswer> {
        this.sent.push({ url, options });

        return Promise.resolve(this.answer);
    }
}

function clientOf(shop: RecordingShop, deadlineMs?: number): TestOrders {
    return new TestOrders(shop, REST_BASE, new TestOrderProofs(SECRET, () => SECONDS), deadlineMs);
}

test.describe('the runner\'s client of the shop\'s test orders', () => {
    test('posts the recognition probe with a proof made for recognising, over the probe\'s subject', async () => {
        const shop = new RecordingShop(200, 'true');

        expect(await clientOf(shop, 12_000).recognition()).toEqual({ recognised: true });
        expect(shop.sent).toEqual([{
            url: `${REST_BASE}test-orders/recognition`,
            options: {
                headers: { [TEST_ORDER_PROOF_HEADER]: signTestOrderProof(SECRET, 'recognise', RECOGNITION_SUBJECT, SECONDS) },
                data: {},
                timeout: 12_000,
                maxRedirects: 0,
            },
        }]);
    });

    test('reaches the REST API of the store view it is built for, below that store\'s path', async () => {
        const shop = new RecordingShop(200, 'true');
        const storefront = {
            store: { code: 'fr', path: '/fr/', locale: 'fr-FR' },
            url: (path: string): string => `https://shop.example/fr/${path}`,
        };

        await TestOrders.of(storefront, shop, new TestOrderProofs(SECRET, () => SECONDS)).recognition();

        expect(shop.sent.map(request => request.url)).toEqual(['https://shop.example/fr/rest/fr/V1/test-orders/recognition']);
    });

    test('is not recognised when the shop refuses the proof, and says what the shop answered', async () => {
        const shop = new RecordingShop(401, '{"message":"The consumer isn\'t authorized to access %resources."}');

        expect(await clientOf(shop).recognition()).toEqual({
            recognised: false,
            status: 401,
            reason: 'The consumer isn\'t authorized to access %resources.',
        });
    });

    test('is not recognised by a shop that refuses test orders on its live payment keys, and names that reason', async () => {
        const reason = 'Test orders are refused while the card payments of this store run on live keys.';
        const shop = new RecordingShop(403, JSON.stringify({ message: reason }));

        expect(await clientOf(shop).recognition()).toEqual({ recognised: false, status: 403, reason });
    });

    test('is not recognised by a shop that has no recognition probe at all', async () => {
        const shop = new RecordingShop(404, '{"message":"Request does not match any route."}');

        expect(await clientOf(shop).recognition()).toMatchObject({ recognised: false, status: 404 });
    });

    test('quotes only the start of a body that is not JSON: a web server\'s error page is no reason', async () => {
        const page = `<html><body>${'x'.repeat(5_000)}</body></html>`;

        expect(await clientOf(new RecordingShop(502, page)).recognition()).toEqual({ recognised: false, status: 502, reason: page.slice(0, 200) });
        await expect(clientOf(new RecordingShop(502, page)).abandon(MASKED_CART_ID)).rejects.toThrow(new RegExp(`\\(502\\): ${page.slice(0, 200)}$`));
    });

    test('is not recognised by an answer other than true, even a successful one', async () => {
        for (const body of ['false', '"true"', '', '<html></html>']) {
            expect(await clientOf(new RecordingShop(200, body)).recognition(), body).toMatchObject({ recognised: false });
        }

        expect(await clientOf(new RecordingShop(201, 'true')).recognition()).toMatchObject({ recognised: false, status: 201 });
    });

    test('abandons the test order of a cart with a proof made for abandoning that cart', async () => {
        const shop = new RecordingShop(200, '{"increment_id":"100012345","state":"canceled","deleted":false}');

        expect(await clientOf(shop).abandon(MASKED_CART_ID)).toEqual({
            kind: 'abandoned',
            order: { incrementId: '100012345', state: 'canceled', deleted: false },
        });
        expect(shop.sent).toEqual([{
            url: `${REST_BASE}test-orders/${MASKED_CART_ID}/abandon`,
            options: {
                headers: { [TEST_ORDER_PROOF_HEADER]: signTestOrderProof(SECRET, 'abandon', MASKED_CART_ID, SECONDS) },
                data: {},
                timeout: 30_000,
                maxRedirects: 0,
            },
        }]);
    });

    test('reads an order the shop could not cancel as still open, naming the state it stays in', async () => {
        const shop = new RecordingShop(200, '{"increment_id":"100012345","state":"processing","deleted":false}');

        expect(await clientOf(shop).abandon(MASKED_CART_ID)).toEqual({
            kind: 'still-open',
            order: { incrementId: '100012345', state: 'processing', deleted: false },
        });
    });

    test('reads a cart the shop placed no order from as nothing to abandon, with the shop\'s reason', async () => {
        const shop = new RecordingShop(404, '{"message":"No order was placed from test cart Mg4w."}');

        expect(await clientOf(shop).abandon(MASKED_CART_ID)).toEqual({
            kind: 'nothing-placed',
            reason: 'No order was placed from test cart Mg4w.',
        });
    });

    test('fails, naming the shop\'s reason, when the shop refuses to abandon the order', async () => {
        const shop = new RecordingShop(401, '{"message":"The test-order proof was refused."}');

        await expect(clientOf(shop).abandon(MASKED_CART_ID)).rejects.toThrow(/401.*The test-order proof was refused\./);
    });

    test('reads a deleted order, and an order the shop names no number for', () => {
        expect(parseAbandonedTestOrder('{"increment_id":"100012345","state":"canceled","deleted":true}'))
            .toEqual({ incrementId: '100012345', state: 'canceled', deleted: true });
        expect(parseAbandonedTestOrder('{"state":"canceled","deleted":true}'))
            .toEqual({ incrementId: null, state: 'canceled', deleted: true });
    });

    test('refuses an answer without the shape the shop publishes', () => {
        for (const body of ['', 'true', '{"state":"canceled"}', '{"state":1,"deleted":false}', '{"increment_id":5,"state":"canceled","deleted":false}']) {
            expect(() => parseAbandonedTestOrder(body), body).toThrow(TestOrderContractError);
        }
    });

    test('quotes only the start of an answer it cannot read', () => {
        const page = `<html>${'x'.repeat(5_000)}</html>`;

        expect(() => parseAbandonedTestOrder(page)).toThrow(`without its state: ${page.slice(0, 200)}`);
        expect(() => parseAbandonedTestOrder(page)).not.toThrow(page);
    });
});
