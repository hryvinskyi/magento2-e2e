import path from 'node:path';
import type { ModuleTests } from '../modules/module-tests';

/**
 * One set of test files every browser runs, as a project of each: `desktop` + `-modules` is the
 * project `desktop-modules`.
 */
export interface Suite {
    /** Appended to the browser's name to name the project; `''` for the storefront-wide tests. */
    readonly suffix: string;
    /** The directory Playwright walks for the suite's files. */
    readonly testDir: string;
    /** The files of the suite, as globs. */
    readonly testMatch: string | readonly string[];
}

/** Where the suites of a run come from. */
export interface SuiteSources {
    /** The directory of the Playwright config. */
    readonly configDir: string;
    /** The storefront-wide tests, relative to `configDir`. */
    readonly testDir: string;
    /** The Magento installation the module tests were discovered in. */
    readonly magentoRoot: string;
    /** The enabled modules that ship tests, as discovery found them. */
    readonly modules: readonly ModuleTests[];
}

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
export function suitesOf(sources: SuiteSources): readonly Suite[] {
    const appCode = sources.modules.filter(module => module.source === 'app/code').map(module => module.dir);
    const packages = sources.modules.filter(module => module.source === 'vendor').map(module => module.dir);

    return [
        { suffix: '', testDir: path.join(sources.configDir, sources.testDir), testMatch: `**/${SPEC_FILES}` },
        ...(appCode.length === 0
            ? []
            : [{
                suffix: '-modules',
                testDir: path.join(sources.magentoRoot, 'app', 'code'),
                testMatch: appCode.map(specFilesBelow),
            }]),
        ...packageSuites(sources.magentoRoot, packages),
    ];
}

/** A group of package directories that share the first directory their path takes from the root. */
interface PackageGroup {
    readonly name: string;
    readonly dirs: readonly string[];
}

function packageSuites(magentoRoot: string, dirs: readonly string[]): readonly Suite[] {
    const groups = packageGroups(magentoRoot, dirs);
    const names = groups.map(group => group.name);
    const repeated = names.find((name, index) => names.indexOf(name) !== index);

    if (repeated !== undefined) {
        throw new Error(
            `Composer packages are installed both in "${repeated}" below the Magento root and in a "${repeated}" `
            + `directory beside it, so their tests would form two suites named "-packages-${repeated}".`,
        );
    }

    return groups.map((group): Suite => ({
        suffix: groups.length === 1 ? '-packages' : `-packages-${group.name}`,
        testDir: commonAncestor(group.dirs),
        testMatch: group.dirs.map(specFilesBelow),
    }));
}

/**
 * The package directories grouped by the first directory of their path relative to the root, the
 * `..` steps of a path outside the root counted in, sorted by that directory's name.
 */
function packageGroups(magentoRoot: string, dirs: readonly string[]): readonly PackageGroup[] {
    const groups = new Map<string, { name: string; dirs: string[] }>();

    for (const dir of dirs) {
        const segments = path.relative(magentoRoot, dir).split(path.sep);
        const steps = segments.findIndex(segment => segment !== '..');
        const name = segments[steps] ?? '';
        const key = `${String(steps)}${path.sep}${name}`;
        const group = groups.get(key);

        if (group === undefined) {
            groups.set(key, { name, dirs: [dir] });
        } else {
            group.dirs.push(dir);
        }
    }

    return [...groups.values()].sort((first, second) => first.name.localeCompare(second.name, 'en'));
}

/** The deepest directory every one of `dirs` lies in. */
function commonAncestor(dirs: readonly string[]): string {
    const [first, ...rest] = dirs.map(dir => path.resolve(dir).split(path.sep));

    if (first === undefined) {
        throw new Error('A package suite has no directories.');
    }

    const shared = rest.reduce(
        (length, segments) => {
            let common = 0;

            while (common < length && segments[common] === first[common]) {
                common++;
            }

            return common;
        },
        first.length,
    );

    return first.slice(0, shared).join(path.sep) || path.sep;
}

function specFilesBelow(dir: string): string {
    return path.join(dir, '**', SPEC_FILES);
}
