"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pageModule = pageModule;
/**
 * Loads one of the page's AMD modules inside the page, through the page's own RequireJS, and answers
 * with a handle to it. The module stays in the page: a later `page.evaluate()` receives it as an
 * argument and narrows it there before using it. Rejects when the page has no RequireJS or the module
 * cannot be loaded.
 */
async function pageModule(page, name) {
    return page.evaluateHandle(moduleName => new Promise((resolve, reject) => {
        const load = window.requirejs;
        if (load === undefined) {
            reject(new Error(`The page has no RequireJS to load ${moduleName} with.`));
            return;
        }
        load([moduleName], resolve, reject);
    }), name);
}
