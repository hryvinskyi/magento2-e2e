/** What loading a `.env` file needs from the process. */
export interface EnvFileLoader {
    exists(file: string): boolean;
    /** Adds the file's settings to the process environment; a setting the environment already has keeps its value. */
    load(file: string): void;
}
/** Loading into the running process, with Node's own `.env` parser. */
export declare const processEnvFile: EnvFileLoader;
/**
 * Applies the `.env` file beside the Playwright config, when there is one. A variable already set in
 * the environment wins over the file, so a CI job or a one-off `E2E_ENV=… npx playwright test`
 * overrides a developer's file without editing it.
 *
 * The config is evaluated in the runner and again in every worker, so the file is applied before any
 * fixture reads a setting.
 */
export declare function loadEnvFile(configDir: string, loader?: EnvFileLoader): void;
