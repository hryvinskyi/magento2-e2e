"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DEVICES = void 0;
exports.devicesOfRun = devicesOfRun;
exports.deviceOptions = deviceOptions;
const test_1 = require("@playwright/test");
const variables_1 = require("../environment/variables");
/**
 * Every test on a desktop Chromium, except those only a phone runs (`@mobile-only`), and the tests
 * tagged `@mobile` on an Android phone.
 */
exports.DEFAULT_DEVICES = Object.freeze([
    Object.freeze({ name: 'desktop', device: 'Desktop Chrome', grepInvert: /@mobile-only/ }),
    Object.freeze({ name: 'mobile', device: 'Pixel 7', grep: /@mobile/ }),
]);
/**
 * Safari's engine, the same two ways round. It differs from Chromium in focus handling and layout;
 * it does not reproduce iOS itself, which needs a real iPhone.
 */
const WEBKIT_DEVICES = Object.freeze([
    Object.freeze({ name: 'desktop-safari', device: 'Desktop Safari', grepInvert: /@mobile-only/ }),
    Object.freeze({ name: 'iphone', device: 'iPhone 13', grep: /@mobile/ }),
]);
/**
 * The browsers of a run: the project's own list when it gives one, otherwise the default ones, with
 * Safari's engine added while `E2E_WEBKIT` is set (it needs its browser installed first).
 */
function devicesOfRun(configured, variables) {
    if (configured !== undefined) {
        return configured;
    }
    return (0, variables_1.setting)(variables, 'E2E_WEBKIT') === undefined ? exports.DEFAULT_DEVICES : [...exports.DEFAULT_DEVICES, ...WEBKIT_DEVICES];
}
/** The browser settings of a Playwright device; a name Playwright does not know is refused, naming it. */
function deviceOptions(name) {
    const descriptor = Object.hasOwn(test_1.devices, name) ? test_1.devices[name] : undefined;
    if (descriptor === undefined) {
        throw new Error(`"${name}" is not one of Playwright's devices (see the \`devices\` export of @playwright/test).`);
    }
    return { ...descriptor };
}
