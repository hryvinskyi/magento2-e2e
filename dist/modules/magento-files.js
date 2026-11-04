"use strict";
/**
 * Readers of the Magento and Composer files that say which modules an installation has. They take a
 * file's text or parsed JSON and touch no file system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEnabledModules = parseEnabledModules;
exports.parseRegisteredModule = parseRegisteredModule;
exports.parseModulePackages = parseModulePackages;
/** `'Vendor_Module' => 1` as `app/etc/config.php` writes an enabled module. */
const ENABLED_ENTRY = /['"]([A-Za-z0-9]+_[A-Za-z0-9]+)['"]\s*=>\s*1\b/g;
/**
 * The module a `registration.php` registers: `<registrar>::MODULE, 'Vendor_Module'`, whichever name
 * the file imports the registrar under.
 */
const REGISTERED_MODULE = /::MODULE\s*,\s*['"]([A-Za-z0-9]+_[A-Za-z0-9]+)['"]/;
/** A Composer autoload file that registers a Magento component. */
const REGISTRATION_FILE = /(?:^|\/)registration\.php$/;
/** The modules `app/etc/config.php` enables, by module name. */
function parseEnabledModules(configPhp) {
    return new Set(Array.from(configPhp.matchAll(ENABLED_ENTRY), match => match[1] ?? '').filter(name => name !== ''));
}
/** The module a `registration.php` registers; nothing when it registers none (a theme, a library). */
function parseRegisteredModule(registrationPhp) {
    return REGISTERED_MODULE.exec(registrationPhp)?.[1];
}
/**
 * The `magento2-module` packages of a parsed `vendor/composer/installed.json`, in Composer 2's
 * `{ "packages": [...] }` layout or Composer 1's bare list. Packages of any other type, and entries
 * without a name, are left out.
 */
function parseModulePackages(installed) {
    const packages = isRecord(installed) ? installed.packages : installed;
    if (!Array.isArray(packages)) {
        throw new Error('vendor/composer/installed.json lists no packages: expected a list, or an object with a "packages" list');
    }
    return packages.flatMap((entry) => {
        if (!isRecord(entry) || entry.type !== 'magento2-module' || typeof entry.name !== 'string') {
            return [];
        }
        const installPath = entry['install-path'];
        return [{
                name: entry.name,
                installPath: typeof installPath === 'string' ? installPath : undefined,
                registrationFiles: autoloadFiles(entry.autoload).filter(file => REGISTRATION_FILE.test(file)),
            }];
    });
}
function autoloadFiles(autoload) {
    if (!isRecord(autoload) || !Array.isArray(autoload.files)) {
        return [];
    }
    return autoload.files.filter((file) => typeof file === 'string');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
