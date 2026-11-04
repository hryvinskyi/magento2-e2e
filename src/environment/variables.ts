/**
 * The process settings a run reads, `process.env` in practice. Only the edges of the package pass
 * `process.env` itself; everything below them is handed the variables it reads from.
 */
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** A setting's value without surrounding white space; a setting that is empty reads as unset. */
export function setting(variables: EnvironmentVariables, name: string): string | undefined {
    const value = variables[name]?.trim();

    return value === undefined || value === '' ? undefined : value;
}

/** The name of a setting given per store: `E2E_<NAME>_<STORE CODE in upper case>`. */
export function storeSettingName(name: string, code: string): string {
    return `E2E_${name}_${code.toUpperCase()}`;
}

/**
 * A setting that is `on` or `off`, case-insensitively; unset reads as `fallback`. Any other value is a
 * typing mistake that would silently mean one of the two, so it is refused.
 */
export function switchSetting(variables: EnvironmentVariables, name: string, fallback: boolean): boolean {
    const value = setting(variables, name)?.toLowerCase();

    if (value === undefined) {
        return fallback;
    }

    if (value !== 'on' && value !== 'off') {
        throw new Error(`${name} must be "on" or "off"; got "${variables[name] ?? ''}".`);
    }

    return value === 'on';
}
