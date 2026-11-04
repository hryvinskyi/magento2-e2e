import type { Command } from './context';
/** What stripping the traces out of a results directory did. */
export interface StripOutcome {
    /** How many trace attachments were taken out of the results. */
    readonly removed: number;
}
/**
 * Takes Playwright traces out of the results the shared report is built from. A trace records every
 * request with its headers (a staging login, session cookies), and the shared report is read outside
 * the team; the internal Playwright report keeps the traces.
 *
 * Each trace attachment is dropped from its result and its file deleted, and the step the reporter
 * wraps it in goes with it once nothing else is in that step. A directory that does not exist has
 * nothing to strip.
 */
export declare function stripTraces(dir: string): StripOutcome;
export declare const stripTracesCommand: Command;
