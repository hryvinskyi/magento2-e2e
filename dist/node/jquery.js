"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMagentoJQuery = loadMagentoJQuery;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_vm_1 = __importDefault(require("node:vm"));
/**
 * The Magento installation's own jQuery (`lib/web/jquery.js` below `magentoRoot`), loaded in plain
 * Node — a fresh copy on every call — so that a pure module built on jQuery Deferreds is tested
 * against the real implementation: the same synchronous `done`/`fail`, the same `state()`, the same
 * `$.when`, instead of a stand-in that only resembles it.
 *
 * Node has no DOM. jQuery reads the document while it loads (feature tests, the ready handler), so it
 * is given an inert one: every property and call on it answers with another inert value. Only
 * jQuery's DOM-free parts are meaningful here — `Deferred`, `when`, `Callbacks`, `extend`; anything
 * that touches elements, events or requests does nothing useful and must not be relied on.
 */
function loadMagentoJQuery(magentoRoot) {
    const file = node_path_1.default.resolve(magentoRoot, 'lib', 'web', 'jquery.js');
    const hostModule = { exports: {} };
    const window = {
        document: inertValue(),
        location: { href: 'http://localhost/' },
        navigator: { userAgent: '' },
        setTimeout,
        clearTimeout,
    };
    const run = new node_vm_1.default.Script(`(function (module, window) {\n${node_fs_1.default.readFileSync(file, 'utf8')}\n})`, { filename: file }).runInThisContext();
    if (!isCallable(run)) {
        throw new Error(`${file} could not be wrapped for loading.`);
    }
    run(hostModule, window);
    if (!isJQueryCore(hostModule.exports)) {
        throw new Error(`${file} did not define jQuery with Deferred() and when().`);
    }
    return hostModule.exports;
}
function isCallable(value) {
    return typeof value === 'function';
}
function isJQueryCore(value) {
    return typeof value === 'function'
        && 'Deferred' in value
        && typeof value.Deferred === 'function'
        && 'when' in value
        && typeof value.when === 'function';
}
/**
 * Stands in for the document and everything reached through it. It reports itself as a document that
 * has finished loading, converts to an empty string, and answers every other property read or call
 * with another inert value; writes are accepted and forgotten.
 */
function inertValue() {
    return new Proxy(function inert() {
        // An inert value does nothing when called; the proxy's `apply` answers instead.
    }, {
        get(_target, property) {
            if (property === Symbol.toPrimitive) {
                return () => '';
            }
            if (property === 'nodeType') {
                return 9;
            }
            if (property === 'readyState') {
                return 'complete';
            }
            return inertValue();
        },
        apply() {
            return inertValue();
        },
        set() {
            return true;
        },
    });
}
