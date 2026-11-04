import type { Page } from '@playwright/test';
/**
 * Moves keyboard focus to the next control, as a visitor on this browser does.
 *
 * Safari's engine, by default, lets Tab reach only form fields; buttons and links take focus with
 * Option+Tab. Pressing plain Tab there would skip the control a test is tabbing to.
 */
export declare function tabToNextControl(page: Page): Promise<void>;
