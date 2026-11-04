"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suitesOf = suitesOf;
const node_path_1 = __importDefault(require("node:path"));
const SPEC_FILES = '*.spec.ts';
/**
 * The suites of a run: the storefront-wide tests; the tests of the modules under `app/code`, when
 * there are any; and the tests of Composer packages, when there are any.
 *
 * Playwright walks the whole `testDir` of a project before it matches a single file, so a package
 * suite's `testDir` is kept as narrow as its files allow. The packages are grouped by the first
 * directory below the Magento root their real path lies in (`vendor`, `packages`, …), each group is
 * one suite whose `testDir` is the nearest directory all its packages share, and so no suite walks
 * the Magento root itself. A package that lies outside the root forms a group of its own with the
 * other packages under the same directory beside the root. One group makes the suite `-packages`;
 * several make one `-packages-<directory>` each.
 */
function suitesOf(sources) {
    const appCode = sources.modules.filter(module => module.source === 'app/code').map(module => module.dir);
    const packages = sources.modules.filter(module => module.source === 'vendor').map(module => module.dir);
    return [
        { suffix: '', testDir: node_path_1.default.join(sources.configDir, sources.testDir), testMatch: `**/${SPEC_FILES}` },
        ...(appCode.length === 0
            ? []
            : [{
                    suffix: '-modules',
                    testDir: node_path_1.default.join(sources.magentoRoot, 'app', 'code'),
                    testMatch: appCode.map(specFilesBelow),
                }]),
        ...packageSuites(sources.magentoRoot, packages),
    ];
}
function packageSuites(magentoRoot, dirs) {
    const groups = packageGroups(magentoRoot, dirs);
    const names = groups.map(group => group.name);
    const repeated = names.find((name, index) => names.indexOf(name) !== index);
    if (repeated !== undefined) {
        throw new Error(`Composer packages are installed both in "${repeated}" below the Magento root and in a "${repeated}" `
            + `directory beside it, so their tests would form two suites named "-packages-${repeated}".`);
    }
    return groups.map((group) => ({
        suffix: groups.length === 1 ? '-packages' : `-packages-${group.name}`,
        testDir: commonAncestor(group.dirs),
        testMatch: group.dirs.map(specFilesBelow),
    }));
}
/**
 * The package directories grouped by the first directory of their path relative to the root, the
 * `..` steps of a path outside the root counted in, sorted by that directory's name.
 */
function packageGroups(magentoRoot, dirs) {
    const groups = new Map();
    for (const dir of dirs) {
        const segments = node_path_1.default.relative(magentoRoot, dir).split(node_path_1.default.sep);
        const steps = segments.findIndex(segment => segment !== '..');
        const name = segments[steps] ?? '';
        const key = `${String(steps)}${node_path_1.default.sep}${name}`;
        const group = groups.get(key);
        if (group === undefined) {
            groups.set(key, { name, dirs: [dir] });
        }
        else {
            group.dirs.push(dir);
        }
    }
    return [...groups.values()].sort((first, second) => first.name.localeCompare(second.name, 'en'));
}
/** The deepest directory every one of `dirs` lies in. */
function commonAncestor(dirs) {
    const [first, ...rest] = dirs.map(dir => node_path_1.default.resolve(dir).split(node_path_1.default.sep));
    if (first === undefined) {
        throw new Error('A package suite has no directories.');
    }
    const shared = rest.reduce((length, segments) => {
        let common = 0;
        while (common < length && segments[common] === first[common]) {
            common++;
        }
        return common;
    }, first.length);
    return first.slice(0, shared).join(node_path_1.default.sep) || node_path_1.default.sep;
}
function specFilesBelow(dir) {
    return node_path_1.default.join(dir, '**', SPEC_FILES);
}
