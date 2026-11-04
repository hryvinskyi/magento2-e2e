"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setting = setting;
exports.storeSettingName = storeSettingName;
exports.switchSetting = switchSetting;
/** A setting's value without surrounding white space; a setting that is empty reads as unset. */
function setting(variables, name) {
    const value = variables[name]?.trim();
    return value === undefined || value === '' ? undefined : value;
}
/** The name of a setting given per store: `E2E_<NAME>_<STORE CODE in upper case>`. */
function storeSettingName(name, code) {
    return `E2E_${name}_${code.toUpperCase()}`;
}
/**
 * A setting that is `on` or `off`, case-insensitively; unset reads as `fallback`. Any other value is a
 * typing mistake that would silently mean one of the two, so it is refused.
 */
function switchSetting(variables, name, fallback) {
    const value = setting(variables, name)?.toLowerCase();
    if (value === undefined) {
        return fallback;
    }
    if (value !== 'on' && value !== 'off') {
        throw new Error(`${name} must be "on" or "off"; got "${variables[name] ?? ''}".`);
    }
    return value === 'on';
}
