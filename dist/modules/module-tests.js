"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enabledModules = enabledModules;
exports.moduleTests = moduleTests;
const node_path_1 = require("node:path");
const magento_files_1 = require("./magento-files");
const module_files_1 = require("./module-files");
const MODULE_TEST_DIR = (0, node_path_1.join)('Test', 'E2e');
/** The modules `app/etc/config.php` enables, by module name. */
function enabledModules(magentoRoot, files = module_files_1.nodeModuleFiles) {
    const config = files.readText((0, node_path_1.join)(magentoRoot, 'app', 'etc', 'config.php'));
    if (config === undefined) {
        throw new Error(`${magentoRoot} is not a Magento installation: app/etc/config.php is missing`);
    }
    return (0, magento_files_1.parseEnabledModules)(config);
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
function moduleTests(magentoRoot, files = module_files_1.nodeModuleFiles) {
    const enabled = enabledModules(magentoRoot, files);
    const seen = new Set();
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
        .map(candidate => ({ ...candidate, testDir: (0, node_path_1.join)(candidate.moduleDir, MODULE_TEST_DIR) }))
        .filter(candidate => files.isDirectory(candidate.testDir))
        .map((candidate) => ({
        module: candidate.module,
        dir: candidate.source === 'vendor' ? files.realPath(candidate.testDir) : candidate.testDir,
        source: candidate.source,
    }));
}
/** The modules under `app/code/<Vendor>/<Module>/`, by the name their `registration.php` registers. */
function appCodeModules(magentoRoot, files) {
    return files.subdirectories((0, node_path_1.join)(magentoRoot, 'app', 'code'))
        .flatMap(vendorDir => files.subdirectories(vendorDir))
        .flatMap(moduleDir => registeredCandidate((0, node_path_1.join)(moduleDir, 'registration.php'), 'app/code', files));
}
/** The modules the `magento2-module` packages of `vendor/composer/installed.json` register. */
function vendorModules(magentoRoot, files) {
    const vendorDir = (0, node_path_1.join)(magentoRoot, 'vendor');
    const installedFile = (0, node_path_1.join)(vendorDir, 'composer', 'installed.json');
    const installed = files.readText(installedFile);
    if (installed === undefined) {
        return [];
    }
    return (0, magento_files_1.parseModulePackages)(parseJson(installed, installedFile))
        .flatMap(modulePackage => {
        const packageDir = packageDirOf(modulePackage, vendorDir);
        return modulePackage.registrationFiles.flatMap(file => registeredCandidate((0, node_path_1.resolve)(packageDir, file), 'vendor', files));
    });
}
function packageDirOf(modulePackage, vendorDir) {
    return modulePackage.installPath === undefined
        ? (0, node_path_1.resolve)(vendorDir, modulePackage.name)
        : (0, node_path_1.resolve)(vendorDir, 'composer', modulePackage.installPath);
}
function registeredCandidate(registrationFile, source, files) {
    const registration = files.readText(registrationFile);
    const module = registration === undefined ? undefined : (0, magento_files_1.parseRegisteredModule)(registration);
    return module === undefined ? [] : [{ module, moduleDir: (0, node_path_1.dirname)(registrationFile), source }];
}
function byModuleName(candidates) {
    return [...candidates].sort((first, second) => (first.module < second.module ? -1 : first.module > second.module ? 1 : 0));
}
function parseJson(text, file) {
    try {
        const parsed = JSON.parse(text);
        return parsed;
    }
    catch (error) {
        throw new Error(`${file} is not valid JSON`, { cause: error });
    }
}
