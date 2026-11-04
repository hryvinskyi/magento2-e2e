import type { Command } from './context';
/** What a finished run came to, read from Playwright's JSON results. */
export interface RunResults {
    readonly passed: number;
    readonly skipped: number;
    /** Tests that passed on a retry. */
    readonly flaky: readonly string[];
    /** Tests that failed on every try. */
    readonly failed: readonly string[];
}
/** What the summary says about the run besides its results. */
export interface RunFacts {
    /** The words that open the subject: the report's title. */
    readonly title: string;
    readonly environment: string;
    /** What started the run: `deployment`, `nightly`, `manual`, or any other word. */
    readonly trigger: string;
    /** The commit under test; only its first ten characters are shown. */
    readonly commit: string;
    /** Where the full report is; empty when it was not published. */
    readonly reportUrl: string;
    /** The report's login name; its password is never part of a summary. */
    readonly reportUser: string;
}
/** The e-mail a run ends with. */
export interface Summary {
    readonly subject: string;
    readonly html: string;
}
/**
 * Reads Playwright's JSON results. `undefined` when the text is not a results file, so a run that
 * produced none and a run that produced garbage read the same way: it did not run.
 */
export declare function parseRunResults(text: string): RunResults | undefined;
/**
 * The subject and the body of the summary e-mail. The subject reads
 * `<title> <environment>, <trigger>: <verdict> (<passed>/<total>)`; recipients may filter on it, so
 * its shape is kept.
 */
export declare function summarize(results: RunResults | undefined, facts: RunFacts): Summary;
export declare const summaryCommand: Command;
