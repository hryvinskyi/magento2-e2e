import type { ModuleTests } from '../modules/module-tests';
/**
 * One set of test files every browser runs, as a project of each: `desktop` + `-modules` is the
 * project `desktop-modules`.
 */
export interface Suite {
    /** Appended to the browser's name to name the project; `''` for the storefront-wide tests. */
    readonly suffix: string;
    /** The directory Playwright walks for the suite's files. */
    readonly testDir: string;
    /** The files of the suite, as globs. */
    readonly testMatch: string | readonly string[];
}
/** Where the suites of a run come from. */
export interface SuiteSources {
    /** The directory of the Playwright config. */
    readonly configDir: string;
    /** The storefront-wide tests, relative to `configDir`. */
    readonly testDir: string;
    /** The Magento installation the module tests were discovered in. */
    readonly magentoRoot: string;
    /** The enabled modules that ship tests, as discovery found them. */
    readonly modules: readonly ModuleTests[];
}
/**
 * The suites of a run: the storefront-wide tests; the tests of the modules under `app/code`, when
 * there are any; and the tests of Composer packages, when there are any.
 *
 * Playwright walks the whole `testDir` of a project before it matches a single file, so a package
 * suite's `testDir` is kept as narrow as its files allow. The packages are grouped by the first
 * directory below the Magento root their real path lies in (`vendor`, `packages`, …), each group is
 * one suite whose `testDir` is the nearest directory all its packages share, and so no suite walks
 * the Magento root itself. A package that lies outside the root forms a group of its own with the
 * other packages under the same directory beside the root. One group makes the suite `-packages`;
 * several make one `-packages-<directory>` each.
 */
export declare function suitesOf(sources: SuiteSources): readonly Suite[];
