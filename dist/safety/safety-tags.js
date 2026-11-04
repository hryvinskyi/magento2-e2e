"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetyTagRegistry = exports.testOrderSafetyRule = exports.TEST_ORDER_TAG = exports.SEARCH_SERVICE_TAG = exports.MUTATING_TAG = exports.CART_TAG = exports.READONLY_TAG = void 0;
exports.isCoreSafetyTag = isCoreSafetyTag;
exports.declaredSafetyTag = declaredSafetyTag;
exports.requireTestOrderTag = requireTestOrderTag;
/** Carried by a test that only opens pages and reads; it may run against production. */
exports.READONLY_TAG = '@readonly';
/**
 * Carried by a test that builds a guest cart and walks the checkout up to the pay button, never
 * further; it may run against production.
 */
exports.CART_TAG = '@cart';
/** Carried by a test that persists anything — an order, a customer, a review; it never runs against production. */
exports.MUTATING_TAG = '@mutating';
/**
 * Carried by a test that needs the shop's search service; such a test is skipped where the run
 * switches the service off (`E2E_SEARCH_SERVICE=off`). It is not a safety tag.
 */
exports.SEARCH_SERVICE_TAG = '@search';
/** Carried by a test that places a test order the shop recognises, and abandons it. */
exports.TEST_ORDER_TAG = '@order';
/**
 * The rule a project adds to `safetyTags` to place test orders. It runs on production, where a test
 * order goes no further than the payment window; without the secret it is skipped, never placed as
 * an ordinary order, and on the live shop it also needs the project's `productionWriteGuard`, which
 * keeps the payment window and every tracker of the page from receiving a write from the test.
 */
exports.testOrderSafetyRule = {
    onProduction: true,
    refusal: environment => {
        if (environment.testOrderSecret() === undefined) {
            return `${exports.TEST_ORDER_TAG} tests run only with E2E_TEST_ORDER_SECRET set`;
        }
        return environment.targetsProduction() && !environment.guardsWrites()
            ? `${exports.TEST_ORDER_TAG} tests run against the live shop only with productionWriteGuard set`
            : undefined;
    },
};
/** The three tags every project has; a project adds its own beside them and never redefines these. */
const CORE_RULES = new Map([
    [exports.READONLY_TAG, { onProduction: true }],
    [exports.CART_TAG, { onProduction: true }],
    [exports.MUTATING_TAG, { onProduction: false }],
]);
/** Whether a tag is one of the three every project has. */
function isCoreSafetyTag(tag) {
    return CORE_RULES.has(tag);
}
/**
 * The safety tags of a project — the core ones first, then the project's — and the rule of each. A
 * tag that is not in the registry (`@smoke`, `@search`) says nothing about safety and is ignored.
 */
class SafetyTagRegistry {
    rules;
    constructor(projectRules) {
        this.rules = new Map([...CORE_RULES, ...Object.entries(projectRules)]);
    }
    /** Every safety tag, the core ones first. */
    tags() {
        return [...this.rules.keys()];
    }
    /**
     * Why a test carrying these tags may not run in this environment; nothing when it may.
     *
     * A refusal any declared tag's rule gives for the environment comes first. On a run that targets
     * production a test then needs a safety tag, and none of its safety tags may forbid production, so
     * a test that forgot its tag, or that carries one forbidding production beside one allowing it, is
     * skipped rather than run against the live shop.
     */
    refusal(tags, environment) {
        const declared = [...this.rules].filter(([tag]) => tags.includes(tag));
        for (const [, rule] of declared) {
            const refusal = rule.refusal?.(environment);
            if (refusal !== undefined) {
                return refusal;
            }
        }
        if (!environment.targetsProduction()) {
            return undefined;
        }
        const protectedShop = environment.isProduction ? environment.name : 'the live shop';
        if (declared.length === 0) {
            return `a test without a safety tag never runs against ${protectedShop}`;
        }
        const forbidding = declared.find(([, rule]) => !rule.onProduction);
        return forbidding === undefined ? undefined : `${forbidding[0]} tests never run against ${protectedShop}`;
    }
}
exports.SafetyTagRegistry = SafetyTagRegistry;
/**
 * The one safety tag a test declares among `safetyTags`. A test declaring none would run wherever a
 * filter lets it, and one declaring several makes no promise at all, so both are refused, naming the
 * test by its `title`.
 */
function declaredSafetyTag(safetyTags, testTags, title) {
    const declared = testTags.filter(tag => safetyTags.includes(tag));
    const [tag, ...more] = declared;
    if (tag === undefined || more.length > 0) {
        throw new Error(`A test declares exactly one of ${safetyTags.join(', ')}; `
            + `"${title}" declares ${declared.length > 0 ? declared.join(', ') : 'none'}.`);
    }
    return tag;
}
/**
 * Refuses a test that may not place test orders, naming it by its `title`: one without the tag, and one
 * in a project that did not register it. The tag's own rule, and a run's `--grep-invert` of it, decide
 * where test orders go, so a test outside them must not reach the shop with a proof.
 */
function requireTestOrderTag(safetyTags, testTags, title) {
    if (!testTags.includes(exports.TEST_ORDER_TAG)) {
        throw new Error(`The testOrders fixture is for tests tagged ${exports.TEST_ORDER_TAG}; "${title}" is not.`);
    }
    if (!safetyTags.includes(exports.TEST_ORDER_TAG)) {
        throw new Error(`The testOrders fixture needs ${exports.TEST_ORDER_TAG} in the project's safetyTags, with testOrderSafetyRule; `
            + `"${title}" runs without it.`);
    }
}
