"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetyTagRegistry = exports.SEARCH_SERVICE_TAG = exports.MUTATING_TAG = exports.CART_TAG = exports.READONLY_TAG = void 0;
exports.isCoreSafetyTag = isCoreSafetyTag;
exports.declaredSafetyTag = declaredSafetyTag;
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
