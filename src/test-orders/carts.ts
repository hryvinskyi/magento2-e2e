import type { PlacementSigner } from './placement';
import type { TestOrderProofs } from './proof';
import type { Abandonment, TestOrderAbandoner } from './shop';

/** What became of a cart the test had not settled itself, once the clean-up after the test asked the shop. */
export type LeftoverCart =
    | { readonly cart: string; readonly kind: 'answered'; readonly abandonment: Abandonment }
    | { readonly cart: string; readonly kind: 'failed'; readonly error: unknown };

/** The shop's answers after which nothing of the cart is left to end. */
const SETTLING_ANSWERS: ReadonlySet<Abandonment['kind'] | undefined> = new Set(['abandoned', 'nothing-placed']);

/**
 * The carts one test may have placed a test order from, kept so that none outlives the test.
 *
 * A cart is recorded before its pay button is pressed — the shop may create the order even when its
 * answer never reaches the test — and counts as settled once the shop has answered an abandon for it,
 * whether it ended an order or had none to end. An order the shop could not end settles nothing, so
 * a test that ignored that answer still meets it after the test. Whatever is still unsettled when the
 * test ends is abandoned by `abandonLeftovers()`, which the test's fixture calls in its teardown: Playwright runs a
 * fixture's teardown after a failed test and after a timed-out one, while a `finally` in the test body
 * is not waited for once the test has timed out — it runs whenever the step it waits on gives up, if
 * ever, by which time the page may be gone.
 *
 * Once closed, no placement is signed any more, so a test body still running after its timeout cannot
 * place an order the clean-up has already passed by. A placement already on its way holds the clean-up
 * back until the shop has answered it, or its deadline has passed.
 */
export class TestOrderCarts {
    private readonly shop: TestOrderAbandoner;
    private readonly recorded: string[] = [];
    private readonly answers = new Map<string, Abandonment['kind']>();
    private readonly onTheirWay: Promise<unknown>[] = [];
    private closed = false;

    public constructor(shop: TestOrderAbandoner) {
        this.shop = shop;
    }

    /** Remembers a cart an order is about to be placed from; refused once the clean-up has begun. */
    public record(cart: string): void {
        if (this.closed) {
            throw new Error(`No test order is placed from cart ${cart}: the test has ended and its carts were cleaned up.`);
        }

        if (!this.recorded.includes(cart)) {
            this.recorded.push(cart);
        }
    }

    /** Whether a placement from this cart may still be signed: it was recorded, the shop was not asked to abandon it, and the clean-up has not begun. */
    public mayPlace(cart: string): boolean {
        return !this.closed && this.recorded.includes(cart) && !this.answers.has(cart);
    }

    /**
     * Signs the placement of a recorded cart with `proofs`, and refuses — by throwing, which stops the
     * placement in the browser — any cart that was not recorded, already abandoned, or placed after
     * the clean-up began.
     */
    public placementSigner(proofs: TestOrderProofs): PlacementSigner {
        return {
            headersFor: cart => {
                if (!this.mayPlace(cart)) {
                    throw new Error(`The placement from cart ${cart} is not one this test may sign.`);
                }

                return proofs.headersFor('place', cart);
            },
        };
    }

    /** Keeps the clean-up from asking the shop anything until `answer`, the wait for a placement on its way, has settled. */
    public holdCleanUpFor(answer: Promise<unknown>): void {
        this.onTheirWay.push(answer);
    }

    /** Asks the shop to abandon the test order of a cart, and keeps what it answered. */
    public async abandon(cart: string): Promise<Abandonment> {
        const abandonment = await this.shop.abandon(cart);

        this.answers.set(cart, abandonment.kind);

        return abandonment;
    }

    /** The recorded carts the shop has not answered an abandon for, or whose order it could not end, oldest first. */
    public unsettled(): readonly string[] {
        return this.recorded.filter(cart => !SETTLING_ANSWERS.has(this.answers.get(cart)));
    }

    /**
     * Closes the record, waits for the placements on their way, and abandons every unsettled cart, each
     * on its own: one the shop fails to abandon does not keep the others from being tried. Says what
     * became of each.
     */
    public async abandonLeftovers(): Promise<readonly LeftoverCart[]> {
        this.closed = true;
        await Promise.allSettled(this.onTheirWay);

        const leftovers: LeftoverCart[] = [];

        for (const cart of this.unsettled()) {
            try {
                leftovers.push({ cart, kind: 'answered', abandonment: await this.abandon(cart) });
            } catch (error) {
                leftovers.push({ cart, kind: 'failed', error });
            }
        }

        return leftovers;
    }
}
