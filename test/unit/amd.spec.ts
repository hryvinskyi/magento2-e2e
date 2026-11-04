import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loadAmdModule } from '../../src/node/amd';
import { temporaryDirectory } from './temporary-files';

let root = '';

test.beforeAll(() => {
    root = temporaryDirectory({
        'with-dependencies.js': [
            'define([\'./rate\', \'ko\'], function (rate, ko) {',
            '    return { total: function (amount) { return ko.unwrap(amount) * rate; } };',
            '});',
        ].join('\n'),
        'factory-only.js': 'define(function () { return { name: \'factory-only\' }; });',
        'exports-only.js': 'define([\'exports\'], function (exports) { exports.greeting = \'hello\'; });',
        'exports-and-value.js': 'define([\'exports\'], function (exports) { exports.ignored = true; return 7; });',
        'two-definitions.js': 'define(function () { return 1; });\ndefine(function () { return 2; });',
        'no-definition.js': 'var nothing = 1;',
        'named-definition.js': 'define(\'named\', [], function () { return \'named\'; });',
        'amd-flag.js': 'define(function () { return typeof define.amd === \'object\'; });',
    });
});

test.afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

function file(name: string): string {
    return path.join(root, name);
}

function hasTotal(value: unknown): value is { total: (amount: unknown) => unknown } {
    return typeof value === 'object' && value !== null && 'total' in value && typeof value.total === 'function';
}

test.describe('an AMD module loaded in Node', () => {
    test('is handed the dependencies it lists, by the id it writes', () => {
        const unwrap = (value: unknown): unknown => (typeof value === 'number' ? value : Number.NaN);
        const module = loadAmdModule(file('with-dependencies.js'), { './rate': 3, ko: { unwrap } });

        if (!hasTotal(module)) {
            throw new Error('the module did not define total()');
        }

        expect(module.total(5)).toBe(15);
    });

    test('defined by a factory alone is the factory\'s value', () => {
        expect(loadAmdModule(file('factory-only.js'))).toEqual({ name: 'factory-only' });
    });

    test('that fills `exports` and returns nothing is its exports object', () => {
        expect(loadAmdModule(file('exports-only.js'))).toEqual({ greeting: 'hello' });
    });

    test('that fills `exports` and returns a value is that value', () => {
        expect(loadAmdModule(file('exports-and-value.js'))).toBe(7);
    });

    test('sees `define.amd`, as a UMD file checks for it', () => {
        expect(loadAmdModule(file('amd-flag.js'))).toBe(true);
    });

    test('is resolved from the working directory when its path is relative', () => {
        expect(loadAmdModule(path.relative(process.cwd(), file('factory-only.js')))).toEqual({ name: 'factory-only' });
    });

    test('is refused when it needs a dependency the test did not provide, naming it', () => {
        expect(() => loadAmdModule(file('with-dependencies.js'), { './rate': 3 }))
            .toThrow(`${file('with-dependencies.js')} depends on "ko", which the test did not provide.`);
    });

    test('is refused when it calls define() twice, or never', () => {
        expect(() => loadAmdModule(file('two-definitions.js')))
            .toThrow('must call define() exactly once; it called it 2 times.');
        expect(() => loadAmdModule(file('no-definition.js')))
            .toThrow('must call define() exactly once; it called it 0 times.');
    });

    test('is refused when it names itself, a form the loader does not support', () => {
        expect(() => loadAmdModule(file('named-definition.js')))
            .toThrow('calls define() with a form this loader does not support');
    });
});
