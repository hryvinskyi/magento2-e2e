import path from 'node:path';
import { expect, test } from '@playwright/test';
import { suitesOf } from '../../src/config/suites';
import type { ModuleTests } from '../../src/modules/module-tests';

const ROOT = path.join(path.sep, 'srv', 'shop');
const CONFIG_DIR = path.join(ROOT, 'e2e');

function module(source: ModuleTests['source'], ...dir: string[]): ModuleTests {
    return { module: dir.join('_'), dir: path.join(...dir), source };
}

function suites(modules: readonly ModuleTests[]): ReturnType<typeof suitesOf> {
    return suitesOf({ configDir: CONFIG_DIR, testDir: 'tests', magentoRoot: ROOT, modules });
}

function specs(dir: string): string {
    return path.join(dir, '**', '*.spec.ts');
}

test('without module tests there is only the storefront-wide suite, below the config directory', () => {
    expect(suites([])).toEqual([{ suffix: '', testDir: path.join(CONFIG_DIR, 'tests'), testMatch: '**/*.spec.ts' }]);
});

test('the modules under app/code form one suite that walks app/code and matches only their test directories', () => {
    const enabled = module('app/code', ROOT, 'app', 'code', 'Acme', 'One', 'Test', 'E2e');
    const other = module('app/code', ROOT, 'app', 'code', 'Acme', 'Two', 'Test', 'E2e');

    expect(suites([enabled, other])[1]).toEqual({
        suffix: '-modules',
        testDir: path.join(ROOT, 'app', 'code'),
        testMatch: [specs(enabled.dir), specs(other.dir)],
    });
});

test('packages under one directory form the suite -packages, walking only the directory they share', () => {
    const first = module('vendor', ROOT, 'vendor', 'acme', 'module-one', 'Test', 'E2e');
    const second = module('vendor', ROOT, 'vendor', 'acme', 'module-two', 'Test', 'E2e');

    expect(suites([first, second]).slice(1)).toEqual([{
        suffix: '-packages',
        testDir: path.join(ROOT, 'vendor', 'acme'),
        testMatch: [specs(first.dir), specs(second.dir)],
    }]);
});

test('one package\'s suite walks only that package\'s test directory', () => {
    const only = module('vendor', ROOT, 'vendor', 'acme', 'module-one', 'Test', 'E2e');

    expect(suites([only])[1]?.testDir).toBe(only.dir);
});

test('packages of two vendors share vendor/, never the Magento root', () => {
    const acme = module('vendor', ROOT, 'vendor', 'acme', 'module-one', 'Test', 'E2e');
    const other = module('vendor', ROOT, 'vendor', 'other', 'module-two', 'Test', 'E2e');

    expect(suites([acme, other])[1]?.testDir).toBe(path.join(ROOT, 'vendor'));
});

test('packages installed below different directories of the root form one suite per directory, named after it', () => {
    const linked = module('vendor', ROOT, 'packages', 'module-linked', 'Test', 'E2e');
    const installed = module('vendor', ROOT, 'vendor', 'acme', 'module-one', 'Test', 'E2e');

    const packageSuites = suites([installed, linked]).slice(1);

    expect(packageSuites).toEqual([
        { suffix: '-packages-packages', testDir: linked.dir, testMatch: [specs(linked.dir)] },
        { suffix: '-packages-vendor', testDir: installed.dir, testMatch: [specs(installed.dir)] },
    ]);
    expect(packageSuites.map(suite => suite.testDir)).not.toContain(ROOT);
});

test('packages outside the root are grouped by the directory beside the root they lie in', () => {
    const first = module('vendor', path.sep, 'srv', 'modules', 'one', 'Test', 'E2e');
    const second = module('vendor', path.sep, 'srv', 'modules', 'two', 'Test', 'E2e');
    const installed = module('vendor', ROOT, 'vendor', 'acme', 'module-one', 'Test', 'E2e');

    expect(suites([first, installed, second]).slice(1)).toEqual([
        { suffix: '-packages-modules', testDir: path.join(path.sep, 'srv', 'modules'), testMatch: [specs(first.dir), specs(second.dir)] },
        { suffix: '-packages-vendor', testDir: installed.dir, testMatch: [specs(installed.dir)] },
    ]);
});

test('a directory name used both below the root and beside it is refused, as the two suites would share a name', () => {
    const inside = module('vendor', ROOT, 'packages', 'one', 'Test', 'E2e');
    const outside = module('vendor', path.sep, 'srv', 'packages', 'two', 'Test', 'E2e');

    expect(() => suites([inside, outside])).toThrow('their tests would form two suites named "-packages-packages"');
});

test('the storefront-wide tests may live in another directory below the config', () => {
    expect(suitesOf({ configDir: CONFIG_DIR, testDir: 'specs', magentoRoot: ROOT, modules: [] })[0]?.testDir)
        .toBe(path.join(CONFIG_DIR, 'specs'));
});
