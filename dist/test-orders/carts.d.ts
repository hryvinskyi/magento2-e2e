import type { PlacementSigner } from './placement';
import type { TestOrderProofs } from './proof';
import type { Abandonment, TestOrderAbandoner } from './shop';
/** What became of a cart the test had not settled itself, once the clean-up after the test asked the shop. */
export type LeftoverCart = {
    readonly cart: string;
    readonly kind: 'answered';
    readonly abandonment: Abandonment;
} | {
    readonly cart: string;
    readonly kind: 'failed';
    readonly error: unknown;
};
/**
 * The guest carts one test may have placed a test order from, kept so that none outlives the test.
 *
 * A cart is recorded before its pay button is pressed — the shop may create the order even when its
 * answer never reaches the test — and counts as settled once the shop has answered an abandon for it,
 * whether it ended an order or had none to end. An order the shop could not cancel settles nothing, so
 * a test that ignored that answer still meets it after the test. Whatever is still unsettled when the
 * test ends is abandoned by `abandonLeftovers()`, which the test's fixture calls in its teardown: Playwright runs a
 * fixture's teardown after a failed test and after a timed-out one, while a `finally` in the test body
 * is not waited for once the test has timed out — it runs whenever the step it waits on gives up, if
 * ever, by which time the page may be gone.
 *
 * Once closed, no placement is signed any more, so a test body still running after its timeout cannot
 * place an order the clean-up has already passed by.
 */
export declare class TestOrderCarts {
    private readonly shop;
    private readonly recorded;
    private readonly answers;
    private closed;
    constructor(shop: TestOrderAbandoner);
    /** Remembers a cart an order is about to be placed from; refused once the clean-up has begun. */
    record(cart: string): void;
    /** Whether a placement from this cart may still be signed: it was recorded, the shop was not asked to abandon it, and the clean-up has not begun. */
    mayPlace(cart: string): boolean;
    /**
     * Signs the placement of a recorded cart with `proofs`, and refuses — by throwing, which stops the
     * placement in the browser — any cart that was not recorded, already abandoned, or placed after
     * the clean-up began.
     */
    placementSigner(proofs: TestOrderProofs): PlacementSigner;
    /** Asks the shop to abandon the test order of a cart, and keeps what it answered. */
    abandon(cart: string): Promise<Abandonment>;
    /** The recorded carts the shop has not answered an abandon for, or whose order it could not cancel, oldest first. */
    unsettled(): readonly string[];
    /**
     * Closes the record and abandons every unsettled cart, each on its own: one the shop fails to
     * abandon does not keep the others from being tried. Says what became of each.
     */
    abandonLeftovers(): Promise<readonly LeftoverCart[]>;
}
