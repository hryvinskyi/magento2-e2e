"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.perStoreValue = perStoreValue;
const variables_1 = require("../environment/variables");
/**
 * A value recorded per store — a category path, a product's URL key — that a run may replace for one
 * store with `E2E_<NAME>_<STORE CODE>` (`E2E_OFFERS_PATH_MAIN`): a copy of the shop without the
 * production URL rewrites answers some pages only under another path.
 *
 * A store with neither a recorded value nor a setting is refused, naming the table to add it to, so
 * a test never runs against a page nobody chose.
 */
function perStoreValue(name, values) {
    const recorded = Object.freeze({ ...values });
    return (code, variables = process.env) => {
        const value = (0, variables_1.setting)(variables, (0, variables_1.storeSettingName)(name, code)) ?? recorded[code];
        if (value === undefined || value === '') {
            throw new Error(`No value is recorded for store "${code}" in ${name} — add it there.`);
        }
        return value;
    };
}
