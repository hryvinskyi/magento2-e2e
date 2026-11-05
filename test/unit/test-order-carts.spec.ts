import { expect, test } from '@playwright/test';
import { TestOrderCarts } from '../../src/test-orders/carts';
import { signTestOrderProof, TEST_ORDER_PROOF_HEADER, TestOrderProofs } from '../../src/test-orders/proof';
import type { Abandonment, TestOrderAbandoner } from '../../src/test-orders/shop';

/**
 * The record of the carts one test may have placed a test order from, run in Node against a fake of
 * the shop: which carts the clean-up after the test abandons, and which placements may still be signed.
 */

const SECRET = 'e2e-carts-spec-secret-0123456789abcdef';
const SECONDS = 1_790_000_000;
const FIRST_CART = 'Mg4w0eZ3k1qYbVt9XcLpR2sNd8HuJf6A';
const SECOND_CART = 'Zq8L1pW4nB7vC2xK9mT5rY3sD6fG0hJa';

const ABANDONED: Abandonment = {
    kind: 'abandoned',
    order: { incrementId: '100012345', state: 'canceled', deleted: false },
};

const STILL_OPEN: Abandonment = {
    kind: 'still-open',
    order: { incrementId: '100012345', state: 'processing', deleted: false },
};

/** A shop that answers each cart as told, and keeps which carts it was asked to abandon. */
class ScriptedShop implements TestOrderAbandoner {
    public readonly asked: string[] = [];
    private readonly answers: ReadonlyMap<string, Abandonment | Error>;

    public constructor(answers: ReadonlyMap<string, Abandonment | Error>) {
        this.answers = answers;
    }

    public abandon(cart: string): Promise<Abandonment> {
        this.asked.push(cart);
        const answer = this.answers.get(cart) ?? { kind: 'nothing-placed', reason: 'No order was placed from test cart.' };

        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    }
}

test.describe('the clean-up after a test', () => {
    test('waits for a placement on its way, having closed the record first, and only then asks the shop', async () => {
        const shop = new ScriptedShop(new Map([[FIRST_CART, ABANDONED]]));
        const carts = new TestOrderCarts(shop);
        let answered = (): void => undefined;

        carts.record(FIRST_CART);
        carts.holdCleanUpFor(new Promise<void>(resolve => {
            answered = resolve;
        }));

        const leftovers = carts.abandonLeftovers();

        await Promise.resolve();
        expect(shop.asked).toEqual([]);
        expect(carts.mayPlace(FIRST_CART)).toBe(false);

        answered();

        expect(await leftovers).toEqual([{ cart: FIRST_CART, kind: 'answered', abandonment: ABANDONED }]);
        expect(shop.asked).toEqual([FIRST_CART]);
    });

    test('goes on when a wait it was given fails', async () => {
        const shop = new ScriptedShop(new Map([[FIRST_CART, ABANDONED]]));
        const carts = new TestOrderCarts(shop);

        carts.record(FIRST_CART);
        carts.holdCleanUpFor(Promise.reject(new Error('The placement fell over.')));

        expect(await carts.abandonLeftovers()).toEqual([{ cart: FIRST_CART, kind: 'answered', abandonment: ABANDONED }]);
    });
});

test.describe('the carts a test may have placed a test order from', () => {
    test('are abandoned after the test when the test did not abandon them itself', async () => {
        const shop = new ScriptedShop(new Map([[FIRST_CART, ABANDONED]]));
        const carts = new TestOrderCarts(shop);

        carts.record(FIRST_CART);
        carts.record(SECOND_CART);
        await carts.abandon(SECOND_CART);

        expect(await carts.abandonLeftovers()).toEqual([{ cart: FIRST_CART, kind: 'answered', abandonment: ABANDONED }]);
        expect(shop.asked).toEqual([SECOND_CART, FIRST_CART]);
    });

    test('leave nothing to do after a test that abandoned every one of them', async () => {
        const shop = new ScriptedShop(new Map([[FIRST_CART, ABANDONED]]));
        const carts = new TestOrderCarts(shop);

        carts.record(FIRST_CART);
        await carts.abandon(FIRST_CART);

        expect(await carts.abandonLeftovers()).toEqual([]);
        expect(shop.asked).toEqual([FIRST_CART]);
    });

    test('report a cart the shop placed no order from as nothing to abandon', async () => {
        const carts = new TestOrderCarts(new ScriptedShop(new Map()));

        carts.record(FIRST_CART);

        expect(await carts.abandonLeftovers()).toEqual([{
            cart: FIRST_CART,
            kind: 'answered',
            abandonment: { kind: 'nothing-placed', reason: 'No order was placed from test cart.' },
        }]);
    });

    test('are each tried after the test, even when the shop fails to abandon one', async () => {
        const failure = new Error('The shop did not answer.');
        const shop = new ScriptedShop(new Map<string, Abandonment | Error>([[FIRST_CART, failure], [SECOND_CART, ABANDONED]]));
        const carts = new TestOrderCarts(shop);

        carts.record(FIRST_CART);
        carts.record(SECOND_CART);

        expect(await carts.abandonLeftovers()).toEqual([
            { cart: FIRST_CART, kind: 'failed', error: failure },
            { cart: SECOND_CART, kind: 'answered', abandonment: ABANDONED },
        ]);
    });

    test('stay unsettled when the test\'s own abandon failed, so the clean-up tries again', async () => {
        const carts = new TestOrderCarts(new ScriptedShop(new Map([[FIRST_CART, new Error('timeout')]])));

        carts.record(FIRST_CART);

        await expect(carts.abandon(FIRST_CART)).rejects.toThrow('timeout');
        expect(carts.unsettled()).toEqual([FIRST_CART]);
    });

    test('stay unsettled when the shop could not end the order, so a test that ignores the answer still fails after it', async () => {
        const shop = new ScriptedShop(new Map([[FIRST_CART, STILL_OPEN]]));
        const carts = new TestOrderCarts(shop);

        carts.record(FIRST_CART);

        expect(await carts.abandon(FIRST_CART)).toEqual(STILL_OPEN);
        expect(carts.unsettled()).toEqual([FIRST_CART]);
        expect(await carts.abandonLeftovers()).toEqual([{ cart: FIRST_CART, kind: 'answered', abandonment: STILL_OPEN }]);
        expect(shop.asked).toEqual([FIRST_CART, FIRST_CART]);
    });

    test('sign no further placement once the shop has said the order is still open', async () => {
        const carts = new TestOrderCarts(new ScriptedShop(new Map([[FIRST_CART, STILL_OPEN]])));
        const signer = carts.placementSigner(new TestOrderProofs(SECRET, () => SECONDS));

        carts.record(FIRST_CART);
        await carts.abandon(FIRST_CART);

        expect(() => signer.headersFor(FIRST_CART)).toThrow(/not one this test may sign/);
    });

    test('have their placement signed for placing, and only while recorded and not yet abandoned', async () => {
        const carts = new TestOrderCarts(new ScriptedShop(new Map([[FIRST_CART, ABANDONED]])));
        const signer = carts.placementSigner(new TestOrderProofs(SECRET, () => SECONDS));

        expect(() => signer.headersFor(FIRST_CART)).toThrow(/not one this test may sign/);

        carts.record(FIRST_CART);

        expect(signer.headersFor(FIRST_CART)).toEqual({
            [TEST_ORDER_PROOF_HEADER]: signTestOrderProof(SECRET, 'place', FIRST_CART, SECONDS),
        });
        expect(() => signer.headersFor(SECOND_CART)).toThrow(/not one this test may sign/);

        await carts.abandon(FIRST_CART);

        expect(() => signer.headersFor(FIRST_CART)).toThrow(/not one this test may sign/);
    });

    test('sign no placement and take no new cart once the clean-up has begun', async () => {
        const carts = new TestOrderCarts(new ScriptedShop(new Map()));
        const signer = carts.placementSigner(new TestOrderProofs(SECRET, () => SECONDS));

        carts.record(FIRST_CART);
        const cleanUp = carts.abandonLeftovers();

        expect(() => signer.headersFor(FIRST_CART)).toThrow(/not one this test may sign/);
        expect(() => { carts.record(SECOND_CART); }).toThrow(/test has ended/);
        await cleanUp;
    });
});
