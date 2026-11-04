"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keepsEvidence = keepsEvidence;
exports.evidence = evidence;
const test_1 = require("@playwright/test");
const variables_1 = require("./environment/variables");
/**
 * Whether this run keeps evidence for a report read outside the team (`E2E_EVIDENCE=1`). It is read
 * from the process each time it is asked.
 */
function keepsEvidence() {
    return (0, variables_1.setting)(process.env, 'E2E_EVIDENCE') === '1';
}
/**
 * Attaches a named screenshot of what a test has just checked to the test's report: the automatic
 * screenshot shows only how a test ended, this shows the moment each rule was confirmed. Name it in
 * the reader's words ("Pay button on a phone"). Nothing is taken in a run that keeps no evidence.
 */
async function evidence(name, target) {
    if (!keepsEvidence()) {
        return;
    }
    await test_1.test.info().attach(name, { body: await target.screenshot(), contentType: 'image/png' });
}
