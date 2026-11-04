/**
 * The process settings a run reads, `process.env` in practice. Only the edges of the package pass
 * `process.env` itself; everything below them is handed the variables it reads from.
 */
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;
/** A setting's value without surrounding white space; a setting that is empty reads as unset. */
export declare function setting(variables: EnvironmentVariables, name: string): string | undefined;
/** The name of a setting given per store: `E2E_<NAME>_<STORE CODE in upper case>`. */
export declare function storeSettingName(name: string, code: string): string;
/**
 * A setting that is `on` or `off`, case-insensitively; unset reads as `fallback`. Any other value is a
 * typing mistake that would silently mean one of the two, so it is refused.
 */
export declare function switchSetting(variables: EnvironmentVariables, name: string, fallback: boolean): boolean;
