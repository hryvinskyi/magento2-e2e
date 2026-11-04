"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tabToNextControl = tabToNextControl;
/**
 * Moves keyboard focus to the next control, as a visitor on this browser does.
 *
 * Safari's engine, by default, lets Tab reach only form fields; buttons and links take focus with
 * Option+Tab. Pressing plain Tab there would skip the control a test is tabbing to.
 */
async function tabToNextControl(page) {
    const engine = page.context().browser()?.browserType().name();
    await page.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab');
}
