"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportTitle = reportTitle;
const variables_1 = require("../environment/variables");
const DEFAULT_TITLE = 'Storefront checks';
/** The words the report and its e-mail are named with: `E2E_REPORT_TITLE`, or a neutral default. */
function reportTitle(variables) {
    return (0, variables_1.setting)(variables, 'E2E_REPORT_TITLE') ?? DEFAULT_TITLE;
}
