import { expect, test } from '@playwright/test';
import type { ConsumerRun } from './consumer-run';
import { runConsumer } from './consumer-run';
import { annotated, receivedPaths, testIn } from './facts';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const SECRET = 'consumer-test-order-secret-0123456789abcdef';
const OTHER_SECRET = 'consumer-other-order-secret-0123456789abcdef';

const RECOGNITION = '/rest/main/V1/test-orders/recognition';
const ABANDON = '/rest/main/V1/test-orders/consumer-cart/abandon';
const PLACEMENT = '/rest/main/V1/guest-carts/consumer-cart/payment-information';

const LEFT = 'a test order the test leaves is abandoned after it';
const ASKING_CART_TEST = 'a cart test may not ask for test orders';
const UNSIGNED = 'an order test that does not sign places nothing';
const CART_PLACEMENT = 'a cart test is not stopped at a placement';
const OWN_CLIENT = 'a test order goes through the client the project gives';
const DEFAULT_TRACE = 'an order test that keeps the default trace asks the shop nothing';
const TRACE_OBJECT = 'an order test with a trace object asks the shop nothing';

/** One test of the consumer's test-order file, in one browser, on the local environment. */
function runOne(title: string, variables: Readonly<Record<string, string>>): Promise<ConsumerRun> {
    return runConsumer({
        variables: { E2E_ENV: 'local', ...variables },
        args: ['--project=desktop', `--grep=${title}`],
    });
}

const SAME_SECRET = { E2E_TEST_ORDER_SECRET: SECRET, E2E_CONSUMER_SHOP_SECRET: SECRET };

function testOrderRequests(run: ConsumerRun): readonly string[] {
    return receivedPaths(run.received).filter(path => path.includes('test-orders'));
}

test.describe('an @order test', () => {
    test('is skipped without the secret, saying why, and asks the shop nothing', async () => {
        const run = await runOne(LEFT, { E2E_CONSUMER_SHOP_SECRET: SECRET });
        const left = testIn(run.report, 'desktop', LEFT);

        expect(run.report.errors).toEqual([]);
        expect(left.status).toBe('skipped');
        expect(annotated(left, 'skip')).toEqual(['@order tests run only with E2E_TEST_ORDER_SECRET set']);
        expect(testOrderRequests(run)).toEqual([]);
    });

    test('passes when the shop recognises the run, and what it left is abandoned after it', async () => {
        const run = await runOne(LEFT, SAME_SECRET);
        const left = testIn(run.report, 'desktop', LEFT);

        expect(left.errors).toEqual([]);
        expect(left.status).toBe('expected');
        expect(testOrderRequests(run)).toEqual([RECOGNITION, ABANDON]);
        expect(annotated(left, 'test order left by the test'))
            .toEqual(['cart consumer-cart: test order 000000001 abandoned, now canceled']);
    });

    test('fails when the shop could not cancel what it left, saying the order stays in the shop', async () => {
        const run = await runOne(LEFT, { ...SAME_SECRET, E2E_CONSUMER_ABANDONED_STATE: 'processing' });
        const left = testIn(run.report, 'desktop', LEFT);
        const stillOpen = 'cart consumer-cart: test order 000000001 could not be cancelled and is still processing';

        expect(left.status).toBe('unexpected');
        expect(left.errors.join('\n')).toContain(
            `1 test order(s) stay in the shop, and the shop's own clean-up will not end them: ${stillOpen}.`,
        );
        expect(annotated(left, 'test order left by the test')).toEqual([stillOpen]);
    });

    test('fails with the shop\'s reason when the shop refuses the run\'s secret, and abandons nothing', async () => {
        const run = await runOne(LEFT, { E2E_TEST_ORDER_SECRET: OTHER_SECRET, E2E_CONSUMER_SHOP_SECRET: SECRET });
        const left = testIn(run.report, 'desktop', LEFT);

        expect(left.status).toBe('unexpected');
        expect(left.errors.join('\n')).toContain(
            'The shop does not recognise this run\'s test orders (401): The test-order proof was refused. Nothing was placed.',
        );
        expect(testOrderRequests(run)).toEqual([RECOGNITION]);
    });

    test('fails when it posts a placement nobody signed, and the shop receives none', async () => {
        const run = await runOne(UNSIGNED, SAME_SECRET);
        const unsigned = testIn(run.report, 'desktop', UNSIGNED);

        expect(unsigned.status).toBe('unexpected');
        expect(unsigned.errors.join('\n')).toContain(
            `An @order test presses pay only after signTestOrderPlacements(); stopped in the browser: POST http://localhost:${String(run.port)}${PLACEMENT}.`,
        );
        expect(receivedPaths(run.received)).toContain('/');
        expect(receivedPaths(run.received)).not.toContain(PLACEMENT);
    });
});

test.describe('a project\'s own client', () => {
    test('carries the proofs of the run instead of the page\'s', async () => {
        const run = await runOne(OWN_CLIENT, SAME_SECRET);
        const own = testIn(run.report, 'desktop', OWN_CLIENT);

        expect(own.errors).toEqual([]);
        expect(own.status).toBe('expected');
        expect(annotated(own, 'test order left by the test'))
            .toEqual(['cart consumer-cart: test order 000000001 abandoned, now canceled']);
        expect(run.received.filter(request => request.path.includes('test-orders')).map(request => [request.path, request.client]))
            .toEqual([[RECOGNITION, 'own'], [ABANDON, 'own']]);
    });
});

test.describe('an @order test with a trace', () => {
    const CASES = [
        { form: 'the configuration\'s default', title: DEFAULT_TRACE, mode: 'retain-on-failure' },
        { form: 'an object', title: TRACE_OBJECT, mode: 'on' },
    ];

    for (const { form, title, mode } of CASES) {
        test(`is refused, trace set as ${form}, naming the line to add, and asks the shop nothing`, async () => {
            const run = await runOne(title, SAME_SECRET);
            const refused = testIn(run.report, 'desktop', title);

            expect(refused.status).toBe('unexpected');
            expect(refused.errors.join('\n')).toContain(
                `A trace keeps every proof of a test order, and "${title}" runs with trace ${mode}: add test.use({ trace: 'off' }) to its file.`,
            );
            expect(testOrderRequests(run)).toEqual([]);
        });
    }
});

test.describe('a @cart test', () => {
    test('may not ask for test orders: it fails naming the tag and asks the shop nothing', async () => {
        const run = await runOne(ASKING_CART_TEST, SAME_SECRET);
        const asking = testIn(run.report, 'desktop', ASKING_CART_TEST);

        expect(asking.status).toBe('unexpected');
        expect(asking.errors.join('\n')).toContain(`The testOrders fixture is for tests tagged @order; "${ASKING_CART_TEST}" is not.`);
        expect(testOrderRequests(run)).toEqual([]);
    });

    test('is not stopped at a placement', async () => {
        const run = await runOne(CART_PLACEMENT, SAME_SECRET);

        expect(testIn(run.report, 'desktop', CART_PLACEMENT).status).toBe('expected');
        expect(receivedPaths(run.received)).toContain(PLACEMENT);
    });
});
