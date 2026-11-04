import { devices } from '@playwright/test';
import type { EnvironmentVariables } from '../environment/variables';
/**
 * One browser the tests run in: a Playwright device by its name, and which tests it runs.
 */
export interface DeviceProject {
    /** The project name, and the first part of every project name made from it (`mobile-modules`). */
    readonly name: string;
    /** A name from Playwright's device list, e.g. `Desktop Chrome`, `Pixel 7`. */
    readonly device: string;
    /** Only the tests whose title or tags match run in this browser. */
    readonly grep?: RegExp;
    /** The tests whose title or tags match never run in this browser. */
    readonly grepInvert?: RegExp;
}
/** What a Playwright device sets in a project's `use`: viewport, user agent, touch, the browser engine. */
export type DeviceOptions = (typeof devices)[string];
/**
 * Every test on a desktop Chromium, except those only a phone runs (`@mobile-only`), and the tests
 * tagged `@mobile` on an Android phone.
 */
export declare const DEFAULT_DEVICES: readonly DeviceProject[];
/**
 * The browsers of a run: the project's own list when it gives one, otherwise the default ones, with
 * Safari's engine added while `E2E_WEBKIT` is set (it needs its browser installed first).
 */
export declare function devicesOfRun(configured: readonly DeviceProject[] | undefined, variables: EnvironmentVariables): readonly DeviceProject[];
/** The browser settings of a Playwright device; a name Playwright does not know is refused, naming it. */
export declare function deviceOptions(name: string): DeviceOptions;
