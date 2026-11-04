import { expect, test } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import type { Environment } from '../../src/environment/environment';
import { defineProject } from '../../src/project/project';
import type { ProjectConfig } from '../../src/project/project';
import { TestOrderCarts } from '../../src/test-orders/carts';
import { signTestOrderProof, TEST_ORDER_PROOF_HEADER } from '../../src/test-orders/proof';
import { describeAbandonment, finishTestOrderRun, refuseTrace, startTestOrderRun } from '../../src/test-orders/run';
import type { TestOrderRun } from '../../src/test-orders/run';
import type { ShopAnswer, ShopRequests } from '../../src/test-orders/shop';
import { sampleConfig } from './sample-project';

/**
 * One test's run of test orders, in Node against a fake of the shop: what it refuses to start, what it
 * lets a placement be signed for, and what it does with the carts a test leaves.
 */

const SECRET = 'e2e-run-spec-secret-0123456789abcdef-long';
const CART = 'Mg4w0eZ3k1qYbVt9XcLpR2sNd8HuJf6A';
const OTHER_CART = 'Zq8L1pW4nB7vC2xK9mT5rY3sD6fG0hJa';
const PARTNER_ORIGIN = 'https://pay.example.org';
const ABANDONED_ORDER = '{"increment_id":"000000001","state":"canceled","deleted":false}';
const OPEN_ORDER = '{"increment_id":"000000002","state":"processing","deleted":false}';

interface Answer {
    readonly status: number;
    readonly body: string;
}

const NOTHING_PLACED: Answer = { status: 404, body: '{"message":"No test order."}' };

/** A shop that answers by the end of the address, and keeps the addresses it was asked. */
class FakeShop implements ShopRequests {
    public readonly asked: string[] = [];
    private readonly answers: Readonly<Record<string, Answer>>;

    public constructor(answers: Readonly<Record<string, Answer>>) {
        this.answers = answers;
    }

    public post(url: string): Promise<ShopAnswer> {
        this.asked.push(url);

        const found = Object.entries(this.answers).find(([ending]) => url.endsWith(ending));
        const { status, body } = found?.[1] ?? NOTHING_PLACED;

        return Promise.resolve({ status: () => status, text: () => Promise.resolve(body) });
    }
}

const RECOGNISED = { 'test-orders/recognition': { status: 200, body: 'true' } };

function environmentOf(variables: Record<string, string>, overrides: Partial<ProjectConfig> = {}): Environment {
    return defineProject(sampleConfig(overrides)).environment(variables);
}

const storefront = {
    store: { code: 'main', path: '/', locale: 'en-GB' },
    url: (path = ''): string => `https://shop.test/${path}`,
};

function start(shop: FakeShop, variables: Record<string, string> = { E2E_TEST_ORDER_SECRET: SECRET }): Promise<TestOrderRun> {
    return startTestOrderRun({ storefront, requests: shop, environment: environmentOf(variables) });
}

function freshTestInfo(): Pick<TestInfo, 'annotations'> {
    return { annotations: [] };
}

test.describe('starting a run of test orders', () => {
    test('needs the secret, and asks the shop nothing without it', async () => {
        const shop = new FakeShop(RECOGNISED);

        await expect(start(shop, {})).rejects.toThrow('A test order is placed only with E2E_TEST_ORDER_SECRET set.');
        expect(shop.asked).toEqual([]);
    });

    test('asks the shop whether it recognises the run', async () => {
        const shop = new FakeShop(RECOGNISED);

        await start(shop);

        expect(shop.asked).toEqual(['https://shop.test/rest/main/V1/test-orders/recognition']);
    });

    test('stops when the shop does not recognise the run, with its answer, saying nothing was placed', async () => {
        const shop = new FakeShop({ 'test-orders/recognition': { status: 401, body: '{"message":"The proof was refused."}' } });

        await expect(start(shop)).rejects.toThrow(
            'The shop does not recognise this run\'s test orders (401): The proof was refused. Nothing was placed.',
        );
    });

    test('gives the reach of the environment', async () => {
        const environments = { ...sampleConfig().environments, local: { baseUrl: () => 'https://shop.test/', paysTestOrders: true } };
        const paying = await startTestOrderRun({
            storefront,
            requests: new FakeShop(RECOGNISED),
            environment: environmentOf({ E2E_TEST_ORDER_SECRET: SECRET }, { environments }),
        });

        expect(paying.reach).toBe('success-page');
        expect((await start(new FakeShop(RECOGNISED))).reach).toBe('payment-window');
    });

    test('takes its origins and paths from the stores, never from what the write guard allows', async () => {
        const run = await startTestOrderRun({
            storefront,
            requests: new FakeShop(RECOGNISED),
            environment: environmentOf(
                { E2E_ENV: 'production', E2E_TEST_ORDER_SECRET: SECRET },
                { productionWriteGuard: { allowedOrigins: [PARTNER_ORIGIN] } },
            ),
        });

        expect([...run.shopOrigins]).toEqual(['https://www.example.com']);
        expect(run.shopOrigins).not.toContain(PARTNER_ORIGIN);
        expect([...run.storePaths]).toEqual(['/', '/second/']);
    });
});

test.describe('the terms of a placement', () => {
    test('name the cart, and the stores\' origins and paths', async () => {
        const run = await start(new FakeShop(RECOGNISED));
        const terms = run.placementTerms(CART);

        expect(terms.cart).toBe(CART);
        expect(terms.shopOrigins).toBe(run.shopOrigins);
        expect(terms.storePaths).toBe(run.storePaths);
    });

    test('carry no refusal key when the project gives none', async () => {
        const run = await start(new FakeShop(RECOGNISED));

        expect('refusal' in run.placementTerms(CART)).toBe(false);
    });

    test('carry the project\'s refusal', async () => {
        const run = await start(new FakeShop(RECOGNISED));
        const refusal = (): string => 'a side effect';

        expect(run.placementTerms(CART, refusal).refusal).toBe(refusal);
    });

    test('record nothing: the signer refuses a cart the test did not record', async () => {
        const run = await start(new FakeShop(RECOGNISED));
        const { signer } = run.placementTerms(CART);

        expect(run.carts.unsettled()).toEqual([]);
        expect(() => signer.headersFor(CART)).toThrow(`The placement from cart ${CART} is not one this test may sign.`);
    });

    test('sign a recorded cart with a proof made from the run\'s secret', async () => {
        const run = await start(new FakeShop(RECOGNISED));

        run.carts.record(CART);

        const proof = run.placementTerms(CART).signer.headersFor(CART)[TEST_ORDER_PROOF_HEADER] ?? '';
        const [seconds] = proof.split('.');

        expect(proof).toBe(signTestOrderProof(SECRET, 'place', CART, Number(seconds)));
    });
});

test.describe('finishing a run of test orders', () => {
    test('abandons what the test left and notes each in the report', async () => {
        const shop = new FakeShop({
            ...RECOGNISED,
            [`test-orders/${CART}/abandon`]: { status: 200, body: ABANDONED_ORDER },
        });
        const run = await start(shop);
        const testInfo = freshTestInfo();

        run.carts.record(CART);
        run.carts.record(OTHER_CART);
        await finishTestOrderRun(run, testInfo);

        expect(shop.asked.slice(1)).toEqual([
            `https://shop.test/rest/main/V1/test-orders/${CART}/abandon`,
            `https://shop.test/rest/main/V1/test-orders/${OTHER_CART}/abandon`,
        ]);
        expect(testInfo.annotations).toEqual([
            { type: 'test order left by the test', description: `cart ${CART}: test order 000000001 abandoned, now canceled` },
            {
                type: 'test order left by the test',
                description: `cart ${OTHER_CART}: no test order was placed from it, so there was nothing to abandon (No test order.)`,
            },
        ]);
    });

    test('leaves alone what the test abandoned itself', async () => {
        const shop = new FakeShop({ ...RECOGNISED, [`test-orders/${CART}/abandon`]: { status: 200, body: ABANDONED_ORDER } });
        const run = await start(shop);
        const testInfo = freshTestInfo();

        run.carts.record(CART);
        await run.carts.abandon(CART);
        await finishTestOrderRun(run, testInfo);

        expect(shop.asked.filter(url => url.endsWith('/abandon'))).toHaveLength(1);
        expect(testInfo.annotations).toEqual([]);
    });

    test('fails naming how many could not be abandoned, after trying every one and noting it', async () => {
        const shop = new FakeShop({
            ...RECOGNISED,
            [`test-orders/${CART}/abandon`]: { status: 500, body: '{"message":"The shop broke."}' },
            [`test-orders/${OTHER_CART}/abandon`]: { status: 200, body: ABANDONED_ORDER },
        });
        const run = await start(shop);
        const testInfo = freshTestInfo();

        run.carts.record(CART);
        run.carts.record(OTHER_CART);

        const finished = await finishTestOrderRun(run, testInfo).then(() => undefined, (error: unknown) => error);

        expect(finished).toBeInstanceOf(AggregateError);
        expect(finished).toMatchObject({
            message: '1 test order(s) could not be abandoned after the test; the shop\'s own clean-up ends them later.',
        });
        expect(testInfo.annotations.map(annotation => annotation.description)).toEqual([
            `cart ${CART}: could not be abandoned — The shop did not abandon the test order of cart ${CART} (500): The shop broke.`,
            `cart ${OTHER_CART}: test order 000000001 abandoned, now canceled`,
        ]);
    });

    test('fails on an order the shop could not cancel, saying it stays in the shop and the clean-up will not end it', async () => {
        const shop = new FakeShop({ ...RECOGNISED, [`test-orders/${CART}/abandon`]: { status: 200, body: OPEN_ORDER } });
        const run = await start(shop);
        const testInfo = freshTestInfo();

        run.carts.record(CART);

        const finished = await finishTestOrderRun(run, testInfo).then(() => undefined, (error: unknown) => error);
        const stillOpen = `cart ${CART}: test order 000000002 could not be cancelled and is still processing`;

        expect(finished).toBeInstanceOf(AggregateError);
        expect(finished).toMatchObject({
            message: `1 test order(s) stay in the shop, and the shop's own clean-up will not end them: ${stillOpen}.`,
        });
        expect(testInfo.annotations.map(annotation => annotation.description)).toEqual([stillOpen]);
    });

    test('fails on an order the test abandoned itself and the shop could not cancel, though the test ignored the answer', async () => {
        const shop = new FakeShop({ ...RECOGNISED, [`test-orders/${CART}/abandon`]: { status: 200, body: OPEN_ORDER } });
        const run = await start(shop);

        run.carts.record(CART);
        await run.carts.abandon(CART);

        await expect(finishTestOrderRun(run, freshTestInfo())).rejects.toThrow(/stay in the shop/);
    });

    test('names failures and orders still open side by side, each error in its place', async () => {
        const shop = new FakeShop({
            ...RECOGNISED,
            [`test-orders/${CART}/abandon`]: { status: 500, body: '{"message":"The shop broke."}' },
            [`test-orders/${OTHER_CART}/abandon`]: { status: 200, body: OPEN_ORDER },
        });
        const run = await start(shop);

        run.carts.record(CART);
        run.carts.record(OTHER_CART);

        const finished = await finishTestOrderRun(run, freshTestInfo()).then(() => undefined, (error: unknown) => error);
        const stillOpen = `cart ${OTHER_CART}: test order 000000002 could not be cancelled and is still processing`;

        expect(finished).toMatchObject({
            message: '1 test order(s) could not be abandoned after the test; the shop\'s own clean-up ends them later. '
                + `1 test order(s) stay in the shop, and the shop's own clean-up will not end them: ${stillOpen}.`,
            errors: [
                expect.objectContaining({ message: `The shop did not abandon the test order of cart ${CART} (500): The shop broke.` }),
                expect.objectContaining({ message: stillOpen }),
            ],
        });
    });

    test('notes a cart that could not be abandoned without what the failed request sent, and keeps the reason', async () => {
        const proof = `1790000000.${'a'.repeat(64)}`;
        const raw = new Error(`request failed: socket hang up\nCall log:\n  - x-test-order-proof: ${proof}\n  - cookie: session=secret`);
        const carts = new TestOrderCarts({ abandon: () => Promise.reject(raw) });
        const testInfo = freshTestInfo();

        carts.record(CART);

        const finished = await finishTestOrderRun({ carts }, testInfo).then(() => undefined, (error: unknown) => error);

        expect(testInfo.annotations.map(annotation => annotation.description))
            .toEqual([`cart ${CART}: could not be abandoned — request failed: socket hang up`]);
        expect(finished).toBeInstanceOf(AggregateError);
        expect(finished).toMatchObject({ errors: [expect.objectContaining({ message: 'request failed: socket hang up' })] });
    });

    test('closes the record, so a test body still running cannot place another order', async () => {
        const run = await start(new FakeShop(RECOGNISED));

        await finishTestOrderRun(run, freshTestInfo());

        expect(() => { run.carts.record(CART); }).toThrow(`No test order is placed from cart ${CART}: the test has ended`);
    });
});

test.describe('a trace in a test of test orders', () => {
    const TITLE = 'a guest can buy';

    test('is allowed only when it is off, as a string or as an object', () => {
        expect(() => { refuseTrace('off', TITLE); }).not.toThrow();
        expect(() => { refuseTrace({ mode: 'off' }, TITLE); }).not.toThrow();
    });

    test('is refused in any other mode, naming the line to add', () => {
        for (const trace of ['on', 'retain-on-failure', 'on-first-retry', { mode: 'on-first-retry', screenshots: false }] as const) {
            expect(() => { refuseTrace(trace, TITLE); }, JSON.stringify(trace)).toThrow('add test.use({ trace: \'off\' }) to its file');
        }
    });
});

test.describe('what abandoning a test order did, in a reader\'s words', () => {
    test('names the order, its state and whether it was deleted', () => {
        expect(describeAbandonment(CART, { kind: 'abandoned', order: { incrementId: '7', state: 'canceled', deleted: true } }))
            .toBe(`cart ${CART}: test order 7 abandoned, now canceled and deleted`);
    });

    test('says when the shop names no number', () => {
        expect(describeAbandonment(CART, { kind: 'abandoned', order: { incrementId: null, state: 'canceled', deleted: false } }))
            .toBe(`cart ${CART}: test order (no number) abandoned, now canceled`);
    });

    test('says when the shop could not cancel the order, and the state it stays in', () => {
        expect(describeAbandonment(CART, { kind: 'still-open', order: { incrementId: '7', state: 'complete', deleted: false } }))
            .toBe(`cart ${CART}: test order 7 could not be cancelled and is still complete`);
    });

    test('says when nothing was placed, with the shop\'s reason', () => {
        expect(describeAbandonment(CART, { kind: 'nothing-placed', reason: 'No such cart.' }))
            .toBe(`cart ${CART}: no test order was placed from it, so there was nothing to abandon (No such cart.)`);
    });
});
