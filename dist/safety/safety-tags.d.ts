import type { Environment } from '../environment/environment';
/** Carried by a test that only opens pages and reads; it may run against production. */
export declare const READONLY_TAG = "@readonly";
/**
 * Carried by a test that builds a guest cart and walks the checkout up to the pay button, never
 * further; it may run against production.
 */
export declare const CART_TAG = "@cart";
/** Carried by a test that persists anything — an order, a customer, a review; it never runs against production. */
export declare const MUTATING_TAG = "@mutating";
/**
 * Carried by a test that needs the shop's search service; such a test is skipped where the run
 * switches the service off (`E2E_SEARCH_SERVICE=off`). It is not a safety tag.
 */
export declare const SEARCH_SERVICE_TAG = "@search";
/** Where a test carrying a safety tag may run. */
export interface SafetyTagRule {
    /** Whether a test carrying the tag may run on a run that targets production. */
    readonly onProduction: boolean;
    /**
     * Why a test carrying the tag may not run in this environment at all, whichever environment it
     * is; nothing when it may. A tag that needs a secret refuses where the run was given none.
     */
    readonly refusal?: (environment: Environment) => string | undefined;
}
/** Whether a tag is one of the three every project has. */
export declare function isCoreSafetyTag(tag: string): boolean;
/**
 * The safety tags of a project — the core ones first, then the project's — and the rule of each. A
 * tag that is not in the registry (`@smoke`, `@search`) says nothing about safety and is ignored.
 */
export declare class SafetyTagRegistry {
    private readonly rules;
    constructor(projectRules: Readonly<Record<string, SafetyTagRule>>);
    /** Every safety tag, the core ones first. */
    tags(): readonly string[];
    /**
     * Why a test carrying these tags may not run in this environment; nothing when it may.
     *
     * A refusal any declared tag's rule gives for the environment comes first. On a run that targets
     * production a test then needs a safety tag, and none of its safety tags may forbid production, so
     * a test that forgot its tag, or that carries one forbidding production beside one allowing it, is
     * skipped rather than run against the live shop.
     */
    refusal(tags: readonly string[], environment: Environment): string | undefined;
}
/**
 * The one safety tag a test declares among `safetyTags`. A test declaring none would run wherever a
 * filter lets it, and one declaring several makes no promise at all, so both are refused, naming the
 * test by its `title`.
 */
export declare function declaredSafetyTag(safetyTags: readonly string[], testTags: readonly string[], title: string): string;
