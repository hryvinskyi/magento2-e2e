/** The request header the shop reads a test-order proof from. */
export declare const TEST_ORDER_PROOF_HEADER = "X-Test-Order-Proof";
/**
 * What a proof lets the runner do; the shop accepts a proof only for the action it was made for, so a
 * proof that placed an order cannot also abandon one or answer the recognition probe.
 * - `place` — place an order from a guest cart (the subject is the cart's masked id);
 * - `abandon` — end the test order of a guest cart (the subject is the cart's masked id);
 * - `recognise` — ask whether the shop recognises the runner at all (the subject is `RECOGNITION_SUBJECT`).
 */
export declare const TEST_ORDER_ACTIONS: readonly ["place", "abandon", "recognise"];
export type TestOrderAction = typeof TEST_ORDER_ACTIONS[number];
/** What a proof is made over when the runner asks the shop whether it recognises it at all. */
export declare const RECOGNITION_SUBJECT = "recognition";
/** The shortest secret the shop accepts, in bytes; with a shorter one it recognises nothing. */
export declare const MINIMUM_SECRET_BYTES = 32;
/**
 * The runner's proof that it sent a request for `action` about `subject`: `<unix-seconds>.<signature>`,
 * where the signature is the lowercase hex HMAC-SHA256 of `<action>|<subject>|<unix-seconds>` keyed with
 * the shop's test-order secret. The shop accepts it for five minutes either side of the time it names.
 *
 * Refuses what the shop would refuse anyway — a short secret, an action it does not know, an empty
 * subject or one holding the separator, a time that is not ten digits of unix seconds — so a mistake
 * shows here, with its reason, rather than as a refused order.
 */
export declare function signTestOrderProof(secret: string, action: TestOrderAction, subject: string, unixSeconds: number): string;
/** Unix seconds now; given to `TestOrderProofs` by whoever builds it, so a spec can fix the time. */
export type UnixClock = () => number;
/** The clock of the machine the runner is on. */
export declare const systemClock: UnixClock;
/**
 * Makes the proofs of one run: the secret and the clock it was built with, the action and the subject
 * per request. Each proof is made at the moment it is asked for, so it is fresh when it is sent.
 */
export declare class TestOrderProofs {
    private readonly secret;
    private readonly clock;
    constructor(secret: string, clock: UnixClock);
    /** The proof for `action` about `subject`, made now. */
    proofFor(action: TestOrderAction, subject: string): string;
    /** The headers that carry the proof for `action` about `subject`, made now. */
    headersFor(action: TestOrderAction, subject: string): Readonly<Record<string, string>>;
}
