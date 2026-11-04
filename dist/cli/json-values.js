"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isJsonObject = isJsonObject;
exports.textOf = textOf;
exports.countOf = countOf;
exports.listOf = listOf;
/** Whether a parsed JSON value is an object, as opposed to an array, a scalar or `null`. */
function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** The text of a member, or `undefined` when it is absent or not text. */
function textOf(value) {
    return typeof value === 'string' ? value : undefined;
}
/** The count a member holds, `0` when it is absent or not a finite number. */
function countOf(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
/** The elements of a member that is an array; none otherwise. */
function listOf(value) {
    return Array.isArray(value) ? value : [];
}
