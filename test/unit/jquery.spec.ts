import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { loadMagentoJQuery } from '../../src/node/jquery';
import { temporaryDirectory } from './temporary-files';

/**
 * A stand-in for a Magento installation's `lib/web/jquery.js`: a CommonJS-style script that reads the
 * window it is given, as jQuery's own wrapper does, and assigns `module.exports` a function carrying
 * `Deferred` and `when`.
 */
const STAND_IN = `
var loadedAt = window.document.readyState;
function jQuery() {}
jQuery.loadedAt = loadedAt;
jQuery.Deferred = function () {
    var state = 'pending';
    var done = [];
    var deferred = {
        done: function (callback) { if (state === 'resolved') { callback(); } else { done.push(callback); } return deferred; },
        fail: function () { return deferred; },
        always: function (callback) { callback(); return deferred; },
        state: function () { return state; },
        resolve: function () { state = 'resolved'; done.forEach(function (callback) { callback(); }); return deferred; },
        reject: function () { state = 'rejected'; return deferred; },
        promise: function () { return deferred; }
    };
    return deferred;
};
jQuery.when = function () { return jQuery.Deferred().resolve(); };
module.exports = jQuery;
`;

const roots: string[] = [];

function magentoRoot(jquery: string): string {
    const root = temporaryDirectory({ 'lib/web/jquery.js': jquery });

    roots.push(root);

    return root;
}

test.afterAll(() => {
    for (const root of roots) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test.describe('the Magento installation\'s jQuery loaded in Node', () => {
    test('is read from lib/web/jquery.js below the root, and offers Deferred and when', () => {
        const jquery = loadMagentoJQuery(magentoRoot(STAND_IN));
        const deferred = jquery.Deferred();
        const seen: string[] = [];

        deferred.done(() => seen.push('done'));
        expect(deferred.state()).toBe('pending');
        deferred.resolve();

        expect(deferred.state()).toBe('resolved');
        expect(seen).toEqual(['done']);
        expect(jquery.when().state()).toBe('resolved');
    });

    test('loads against a document that has finished loading', () => {
        expect(loadMagentoJQuery(magentoRoot(STAND_IN))).toHaveProperty('loadedAt', 'complete');
    });

    test('is a fresh copy on every call', () => {
        const root = magentoRoot(STAND_IN);

        expect(loadMagentoJQuery(root)).not.toBe(loadMagentoJQuery(root));
    });

    test('is refused when the file defines no jQuery with Deferred and when', () => {
        const root = magentoRoot('module.exports = function jQuery() {};');

        expect(() => loadMagentoJQuery(root)).toThrow('did not define jQuery with Deferred() and when().');
    });

    test('is refused when the installation has no lib/web/jquery.js', () => {
        const root = temporaryDirectory({});

        roots.push(root);

        expect(() => loadMagentoJQuery(root)).toThrow(/ENOENT/);
    });
});
