/**
 * Loads a RequireJS (AMD) module in plain Node, so a pure module — a rule, a calculation, a small
 * state model — is tested without a browser.
 *
 * The file runs in this process's own realm through `node:vm`, with a `define` that hands the factory
 * the values given in `dependencies`, keyed by the dependency id exactly as the module writes it
 * (`'../model/constants'`, `'ko'`). An id missing from the map fails the load and names the id: a
 * module is never run against a dependency nobody provided. The AMD `exports` id is the one exception;
 * it receives a fresh object, which is the module's value when the factory returns nothing (how UMD
 * files define themselves).
 *
 * What the factory returns is `unknown`: the caller narrows it with a type guard before use.
 *
 * @param filePath     the module's file; a relative path is resolved against the working directory
 * @param dependencies the value of each dependency id the module lists
 */
export declare function loadAmdModule(filePath: string, dependencies?: Readonly<Record<string, unknown>>): unknown;
