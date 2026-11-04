import type { Locator, Page } from '@playwright/test';
/**
 * Whether this run keeps evidence for a report read outside the team (`E2E_EVIDENCE=1`). It is read
 * from the process each time it is asked.
 */
export declare function keepsEvidence(): boolean;
/**
 * Attaches a named screenshot of what a test has just checked to the test's report: the automatic
 * screenshot shows only how a test ended, this shows the moment each rule was confirmed. Name it in
 * the reader's words ("Pay button on a phone"). Nothing is taken in a run that keeps no evidence.
 */
export declare function evidence(name: string, target: Page | Locator): Promise<void>;
