import { createHmac } from 'node:crypto';

/** The request header the shop reads a test-order proof from. */
export const TEST_ORDER_PROOF_HEADER = 'X-Test-Order-Proof';

/**
 * What a proof lets the runner do; the shop accepts a proof only for the action it was made for, so a
 * proof that placed an order cannot also abandon one or answer the recognition probe.
 * - `place` — place an order from a cart (the subject is the cart's masked id);
 * - `abandon` — end the test order of a cart (the subject is the cart's masked id);
 * - `recognise` — ask whether the shop recognises the runner at all (the subject is `RECOGNITION_SUBJECT`).
 */
export const TEST_ORDER_ACTIONS = ['place', 'abandon', 'recognise'] as const;

export type TestOrderAction = typeof TEST_ORDER_ACTIONS[number];

/** What a proof is made over when the runner asks the shop whether it recognises it at all. */
export const RECOGNITION_SUBJECT = 'recognition';

/** The shortest secret the shop accepts, in bytes; with a shorter one it recognises nothing. */
export const MINIMUM_SECRET_BYTES = 32;

/** Unix seconds as the shop reads them in a proof: ten digits, no leading zero. */
const TEN_DIGIT_SECONDS = /^[1-9]\d{9}$/;

/** Separates the parts of the message a proof signs; no part may contain it, so no two messages read alike. */
const SEPARATOR = '|';

const isTestOrderAction = (value: string): value is TestOrderAction =>
    (TEST_ORDER_ACTIONS as readonly string[]).includes(value);

/**
 * The runner's proof that it sent a request for `action` about `subject`: `<unix-seconds>.<signature>`,
 * where the signature is the lowercase hex HMAC-SHA256 of `<action>|<subject>|<unix-seconds>` keyed with
 * the shop's test-order secret. The shop accepts it for five minutes either side of the time it names.
 *
 * Refuses what the shop would refuse anyway — a short secret, an action it does not know, an empty
 * subject or one holding the separator, a time that is not ten digits of unix seconds — so a mistake
 * shows here, with its reason, rather than as a refused order.
 */
export function signTestOrderProof(secret: string, action: TestOrderAction, subject: string, unixSeconds: number): string {
    if (Buffer.byteLength(secret, 'utf8') < MINIMUM_SECRET_BYTES) {
        throw new RangeError(`The test-order secret must be at least ${String(MINIMUM_SECRET_BYTES)} bytes long.`);
    }

    if (!isTestOrderAction(action)) {
        throw new RangeError(`A test-order proof is made for one of ${TEST_ORDER_ACTIONS.join(', ')}; got "${String(action)}".`);
    }

    if (subject === '' || subject.includes(SEPARATOR)) {
        throw new RangeError(`A test-order proof is made over a subject without "${SEPARATOR}"; got "${subject}".`);
    }

    const seconds = String(unixSeconds);

    if (!Number.isSafeInteger(unixSeconds) || !TEN_DIGIT_SECONDS.test(seconds)) {
        throw new RangeError(`A test-order proof names ten digits of unix seconds; got ${seconds}.`);
    }

    const message = [action, subject, seconds].join(SEPARATOR);
    const signature = createHmac('sha256', secret).update(message, 'utf8').digest('hex');

    return `${seconds}.${signature}`;
}

/** Unix seconds now; given to `TestOrderProofs` by whoever builds it, so a spec can fix the time. */
export type UnixClock = () => number;

/** The clock of the machine the runner is on. */
export const systemClock: UnixClock = () => Math.floor(Date.now() / 1_000);

/**
 * Makes the proofs of one run: the secret and the clock it was built with, the action and the subject
 * per request. Each proof is made at the moment it is asked for, so it is fresh when it is sent.
 */
export class TestOrderProofs {
    private readonly secret: string;
    private readonly clock: UnixClock;

    public constructor(secret: string, clock: UnixClock) {
        this.secret = secret;
        this.clock = clock;
    }

    /** The proof for `action` about `subject`, made now. */
    public proofFor(action: TestOrderAction, subject: string): string {
        return signTestOrderProof(this.secret, action, subject, this.clock());
    }

    /** The headers that carry the proof for `action` about `subject`, made now. */
    public headersFor(action: TestOrderAction, subject: string): Readonly<Record<string, string>> {
        return { [TEST_ORDER_PROOF_HEADER]: this.proofFor(action, subject) };
    }
}
