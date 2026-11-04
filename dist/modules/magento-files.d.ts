/**
 * Readers of the Magento and Composer files that say which modules an installation has. They take a
 * file's text or parsed JSON and touch no file system.
 */
/** A Magento module package as `vendor/composer/installed.json` lists it. */
export interface ModulePackage {
    /** The Composer package name, `vendor/package`. */
    readonly name: string;
    /**
     * Where the package is installed, relative to `vendor/composer`, as Composer 2 records it; absent
     * from a Composer 1 file, which installs every package at `vendor/<name>`.
     */
    readonly installPath: string | undefined;
    /** The package's registration files, relative to the package; one per module it registers. */
    readonly registrationFiles: readonly string[];
}
/** The modules `app/etc/config.php` enables, by module name. */
export declare function parseEnabledModules(configPhp: string): ReadonlySet<string>;
/** The module a `registration.php` registers; nothing when it registers none (a theme, a library). */
export declare function parseRegisteredModule(registrationPhp: string): string | undefined;
/**
 * The `magento2-module` packages of a parsed `vendor/composer/installed.json`, in Composer 2's
 * `{ "packages": [...] }` layout or Composer 1's bare list. Packages of any other type, and entries
 * without a name, are left out.
 */
export declare function parseModulePackages(installed: unknown): readonly ModulePackage[];
