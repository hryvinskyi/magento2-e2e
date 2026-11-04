import type { FullConfig } from '@playwright/test';
import type { MagentoProject } from '../project/project';
/** Asks for a page and says how it answered. */
export interface StorefrontProbe {
    /** The HTTP status of the answer, or what went wrong when there was none. */
    answer(url: string): Promise<string>;
}
/** How often, and how far apart, the storefront is asked. */
export interface PreflightSchedule {
    readonly attempts: number;
    readonly pauseMs: number;
    pause(ms: number): Promise<void>;
}
/** Three tries, ten seconds apart: long enough for a freshly deployed storefront to warm its caches. */
export declare const DEFAULT_SCHEDULE: PreflightSchedule;
/**
 * Makes sure the storefront answers before any test starts. A storefront that is down fails every
 * test of the run, each with its retries, for half an hour; this stops the run within a minute and
 * says why. It asks the default store's home page, the page the tests open first, in the browser the
 * tests use and with their login and user agent, so it depends on nothing the tests do not: a client
 * of another kind can be turned away by a firewall that lets the browser through, or fail to reach a
 * local site the browser reaches.
 *
 * It is Playwright's global setup of a config `defineMagentoConfig()` made, and finds the project in
 * that config.
 */
export default function preflight(config: FullConfig): Promise<void>;
/**
 * Asks for `url` until it answers 200, pausing between tries; refuses the run when no try did.
 */
export declare function checkStorefront(environmentName: string, url: string, probe: StorefrontProbe, schedule?: PreflightSchedule): Promise<void>;
/**
 * The project of a config `defineMagentoConfig()` made: every project of such a config carries it
 * in its `use`.
 */
export declare function projectInConfig(projects: readonly {
    readonly use: object;
}[]): MagentoProject;
