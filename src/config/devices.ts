import { devices } from '@playwright/test';
import type { EnvironmentVariables } from '../environment/variables';
import { setting } from '../environment/variables';

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
export const DEFAULT_DEVICES: readonly DeviceProject[] = Object.freeze([
    Object.freeze({ name: 'desktop', device: 'Desktop Chrome', grepInvert: /@mobile-only/ }),
    Object.freeze({ name: 'mobile', device: 'Pixel 7', grep: /@mobile/ }),
]);

/**
 * Safari's engine, the same two ways round. It differs from Chromium in focus handling and layout;
 * it does not reproduce iOS itself, which needs a real iPhone.
 */
const WEBKIT_DEVICES: readonly DeviceProject[] = Object.freeze([
    Object.freeze({ name: 'desktop-safari', device: 'Desktop Safari', grepInvert: /@mobile-only/ }),
    Object.freeze({ name: 'iphone', device: 'iPhone 13', grep: /@mobile/ }),
]);

/**
 * The browsers of a run: the project's own list when it gives one, otherwise the default ones, with
 * Safari's engine added while `E2E_WEBKIT` is set (it needs its browser installed first).
 */
export function devicesOfRun(
    configured: readonly DeviceProject[] | undefined,
    variables: EnvironmentVariables,
): readonly DeviceProject[] {
    if (configured !== undefined) {
        return configured;
    }

    return setting(variables, 'E2E_WEBKIT') === undefined ? DEFAULT_DEVICES : [...DEFAULT_DEVICES, ...WEBKIT_DEVICES];
}

/** The browser settings of a Playwright device; a name Playwright does not know is refused, naming it. */
export function deviceOptions(name: string): DeviceOptions {
    const descriptor = Object.hasOwn(devices, name) ? devices[name] : undefined;

    if (descriptor === undefined) {
        throw new Error(`"${name}" is not one of Playwright's devices (see the \`devices\` export of @playwright/test).`);
    }

    return { ...descriptor };
}
