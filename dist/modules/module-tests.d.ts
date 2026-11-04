import type { ModuleFileSystem } from './module-files';
/**
 * Tests that belong to a Magento module live inside it, in `Test/E2e/`, next to the code whose rule
 * they guard. They run only while the module is enabled: a module switched off in
 * `app/etc/config.php` takes its tests out of the run, and a removed module takes them with it.
 */
/** Where a module is installed: under `app/code`, or as a Composer package under `vendor`. */
export type ModuleSource = 'app/code' | 'vendor';
export interface ModuleTests {
    /** The Magento module name, `Vendor_Module`. */
    readonly module: string;
    /** The absolute path of the module's `Test/E2e` directory. */
    readonly dir: string;
    readonly source: ModuleSource;
}
/** The modules `app/etc/config.php` enables, by module name. */
export declare function enabledModules(magentoRoot: string, files?: ModuleFileSystem): ReadonlySet<string>;
/**
 * Every enabled module that ships end-to-end tests: those under `app/code`, then the Composer
 * packages, each sorted by module name. A module both places register is the `app/code` one, which
 * is the copy Magento loads.
 *
 * A package's directory is given by its real path: a Composer path repository installs a package as
 * a symbolic link, and Playwright does not descend into a linked directory, so its tests would never
 * be collected under the linked path.
 */
export declare function moduleTests(magentoRoot: string, files?: ModuleFileSystem): readonly ModuleTests[];
