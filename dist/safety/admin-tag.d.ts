import type { SafetyTagRule } from './safety-tags';
/** Carried by a test that signs in to the shop's admin; a project that declares `admin` has it. */
export declare const ADMIN_TAG = "@admin";
/** What a project says about its admin; `admin: {}` in `defineProject` gives a project the `@admin` tag. */
export interface AdminSettings {
    /**
     * Whether `@admin` tests may run on a run that targets the live shop. Default false: the admin of the
     * live shop holds its real customers, orders and configuration.
     */
    readonly onProduction?: boolean;
}
/**
 * The rule of `@admin`, as `defineProject` registers it for a project that declares `admin`. A test is
 * refused where the environment says nowhere where the admin is, and where the run has no admin user; on
 * a run that targets the live shop it runs only when the project said `onProduction`.
 */
export declare function adminSafetyRule(settings: AdminSettings): SafetyTagRule;
/**
 * Refuses a test that may not work in the admin, naming it by its `title`: one without the tag, and one
 * in a project that declares no admin. The tag's rule decides where the admin is reached, so a test
 * outside it must not sign in at all.
 */
export declare function requireAdminTag(safetyTags: readonly string[], testTags: readonly string[], title: string): void;
