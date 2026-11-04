"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestOrderProofs = exports.systemClock = exports.MINIMUM_SECRET_BYTES = exports.RECOGNITION_SUBJECT = exports.TEST_ORDER_ACTIONS = exports.TEST_ORDER_PROOF_HEADER = void 0;
exports.signTestOrderProof = signTestOrderProof;
const node_crypto_1 = require("node:crypto");
/** The request header the shop reads a test-order proof from. */
exports.TEST_ORDER_PROOF_HEADER = 'X-Test-Order-Proof';
/**
 * What a proof lets the runner do; the shop accepts a proof only for the action it was made for, so a
 * proof that placed an order cannot also abandon one or answer the recognition probe.
 * - `place` — place an order from a guest cart (the subject is the cart's masked id);
 * - `abandon` — end the test order of a guest cart (the subject is the cart's masked id);
 * - `recognise` — ask whether the shop recognises the runner at all (the subject is `RECOGNITION_SUBJECT`).
 */
exports.TEST_ORDER_ACTIONS = ['place', 'abandon', 'recognise'];
/** What a proof is made over when the runner asks the shop whether it recognises it at all. */
exports.RECOGNITION_SUBJECT = 'recognition';
/** The shortest secret the shop accepts, in bytes; with a shorter one it recognises nothing. */
exports.MINIMUM_SECRET_BYTES = 32;
/** Unix seconds as the shop reads them in a proof: ten digits, no leading zero. */
const TEN_DIGIT_SECONDS = /^[1-9]\d{9}$/;
/** Separates the parts of the message a proof signs; no part may contain it, so no two messages read alike. */
const SEPARATOR = '|';
const isTestOrderAction = (value) => exports.TEST_ORDER_ACTIONS.includes(value);
/**
 * The runner's proof that it sent a request for `action` about `subject`: `<unix-seconds>.<signature>`,
 * where the signature is the lowercase hex HMAC-SHA256 of `<action>|<subject>|<unix-seconds>` keyed with
 * the shop's test-order secret. The shop accepts it for five minutes either side of the time it names.
 *
 * Refuses what the shop would refuse anyway — a short secret, an action it does not know, an empty
 * subject or one holding the separator, a time that is not ten digits of unix seconds — so a mistake
 * shows here, with its reason, rather than as a refused order.
 */
function signTestOrderProof(secret, action, subject, unixSeconds) {
    if (Buffer.byteLength(secret, 'utf8') < exports.MINIMUM_SECRET_BYTES) {
        throw new RangeError(`The test-order secret must be at least ${String(exports.MINIMUM_SECRET_BYTES)} bytes long.`);
    }
    if (!isTestOrderAction(action)) {
        throw new RangeError(`A test-order proof is made for one of ${exports.TEST_ORDER_ACTIONS.join(', ')}; got "${String(action)}".`);
    }
    if (subject === '' || subject.includes(SEPARATOR)) {
        throw new RangeError(`A test-order proof is made over a subject without "${SEPARATOR}"; got "${subject}".`);
    }
    const seconds = String(unixSeconds);
    if (!Number.isSafeInteger(unixSeconds) || !TEN_DIGIT_SECONDS.test(seconds)) {
        throw new RangeError(`A test-order proof names ten digits of unix seconds; got ${seconds}.`);
    }
    const message = [action, subject, seconds].join(SEPARATOR);
    const signature = (0, node_crypto_1.createHmac)('sha256', secret).update(message, 'utf8').digest('hex');
    return `${seconds}.${signature}`;
}
/** The clock of the machine the runner is on. */
const systemClock = () => Math.floor(Date.now() / 1_000);
exports.systemClock = systemClock;
/**
 * Makes the proofs of one run: the secret and the clock it was built with, the action and the subject
 * per request. Each proof is made at the moment it is asked for, so it is fresh when it is sent.
 */
class TestOrderProofs {
    secret;
    clock;
    constructor(secret, clock) {
        this.secret = secret;
        this.clock = clock;
    }
    /** The proof for `action` about `subject`, made now. */
    proofFor(action, subject) {
        return signTestOrderProof(this.secret, action, subject, this.clock());
    }
    /** The headers that carry the proof for `action` about `subject`, made now. */
    headersFor(action, subject) {
        return { [exports.TEST_ORDER_PROOF_HEADER]: this.proofFor(action, subject) };
    }
}
exports.TestOrderProofs = TestOrderProofs;
