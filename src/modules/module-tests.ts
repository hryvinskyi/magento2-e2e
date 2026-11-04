import { dirname, join, resolve } from 'node:path';
import type { ModulePackage } from './magento-files';
import { parseEnabledModules, parseModulePackages, parseRegisteredModule } from './magento-files';
import type { ModuleFileSystem } from './module-files';
import { nodeModuleFiles } from './module-files';

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

/** A module directory found in an installation, before its state and its tests are looked at. */
interface ModuleCandidate {
    readonly module: string;
    readonly moduleDir: string;
    readonly source: ModuleSource;
}

const MODULE_TEST_DIR = join('Test', 'E2e');

/** The modules `app/etc/config.php` enables, by module name. */
export function enabledModules(magentoRoot: string, files: ModuleFileSystem = nodeModuleFiles): ReadonlySet<string> {
    const config = files.readText(join(magentoRoot, 'app', 'etc', 'config.php'));

    if (config === undefined) {
        throw new Error(`${magentoRoot} is not a Magento installation: app/etc/config.php is missing`);
    }

    return parseEnabledModules(config);
}

/**
 * Every enabled module that ships end-to-end tests: those under `app/code`, then the Composer
 * packages, each sorted by module name. A module both places register is the `app/code` one, which
 * is the copy Magento loads.
 *
 * A package's directory is given by its real path: a Composer path repository installs a package as
 * a symbolic link, and Playwright does not descend into a linked directory, so its tests would never
 * be collected under the linked path.
 */
export function moduleTests(magentoRoot: string, files: ModuleFileSystem = nodeModuleFiles): readonly ModuleTests[] {
    const enabled = enabledModules(magentoRoot, files);
    const seen = new Set<string>();
    const candidates = [
        ...byModuleName(appCodeModules(magentoRoot, files)),
        ...byModuleName(vendorModules(magentoRoot, files)),
    ].filter(candidate => {
        if (seen.has(candidate.module)) {
            return false;
        }

        seen.add(candidate.module);

        return true;
    });

    return candidates
        .filter(candidate => enabled.has(candidate.module))
        .map(candidate => ({ ...candidate, testDir: join(candidate.moduleDir, MODULE_TEST_DIR) }))
        .filter(candidate => files.isDirectory(candidate.testDir))
        .map((candidate): ModuleTests => ({
            module: candidate.module,
            dir: candidate.source === 'vendor' ? files.realPath(candidate.testDir) : candidate.testDir,
            source: candidate.source,
        }));
}

/** The modules under `app/code/<Vendor>/<Module>/`, by the name their `registration.php` registers. */
function appCodeModules(magentoRoot: string, files: ModuleFileSystem): readonly ModuleCandidate[] {
    return files.subdirectories(join(magentoRoot, 'app', 'code'))
        .flatMap(vendorDir => files.subdirectories(vendorDir))
        .flatMap(moduleDir => registeredCandidate(join(moduleDir, 'registration.php'), 'app/code', files));
}

/** The modules the `magento2-module` packages of `vendor/composer/installed.json` register. */
function vendorModules(magentoRoot: string, files: ModuleFileSystem): readonly ModuleCandidate[] {
    const vendorDir = join(magentoRoot, 'vendor');
    const installedFile = join(vendorDir, 'composer', 'installed.json');
    const installed = files.readText(installedFile);

    if (installed === undefined) {
        return [];
    }

    return parseModulePackages(parseJson(installed, installedFile))
        .flatMap(modulePackage => {
            const packageDir = packageDirOf(modulePackage, vendorDir);

            return modulePackage.registrationFiles.flatMap(
                file => registeredCandidate(resolve(packageDir, file), 'vendor', files),
            );
        });
}

function packageDirOf(modulePackage: ModulePackage, vendorDir: string): string {
    return modulePackage.installPath === undefined
        ? resolve(vendorDir, modulePackage.name)
        : resolve(vendorDir, 'composer', modulePackage.installPath);
}

function registeredCandidate(
    registrationFile: string,
    source: ModuleSource,
    files: ModuleFileSystem,
): readonly ModuleCandidate[] {
    const registration = files.readText(registrationFile);
    const module = registration === undefined ? undefined : parseRegisteredModule(registration);

    return module === undefined ? [] : [{ module, moduleDir: dirname(registrationFile), source }];
}

function byModuleName(candidates: readonly ModuleCandidate[]): readonly ModuleCandidate[] {
    return [...candidates].sort((first, second) => (first.module < second.module ? -1 : first.module > second.module ? 1 : 0));
}

function parseJson(text: string, file: string): unknown {
    try {
        const parsed: unknown = JSON.parse(text);

        return parsed;
    } catch (error) {
        throw new Error(`${file} is not valid JSON`, { cause: error });
    }
}
