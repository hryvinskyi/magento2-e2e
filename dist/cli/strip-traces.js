"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripTracesCommand = void 0;
exports.stripTraces = stripTraces;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const json_values_1 = require("./json-values");
/** The results of a run the shared report is built from: one file per test, one per group of tests. */
const RESULT_FILE = /-(?:result|container)\.json$/;
/** The name the reporter gives the attachment of a Playwright trace, and the step it wraps it in. */
const TRACE_NAME = 'trace';
/**
 * Takes Playwright traces out of the results the shared report is built from. A trace records every
 * request with its headers (a staging login, session cookies), and the shared report is read outside
 * the team; the internal Playwright report keeps the traces.
 *
 * Each trace attachment is dropped from its result and its file deleted, and the step the reporter
 * wraps it in goes with it once nothing else is in that step. A directory that does not exist has
 * nothing to strip.
 */
function stripTraces(dir) {
    const root = node_path_1.default.resolve(dir);
    let removed = 0;
    const deleteAttachment = (source) => {
        const file = node_path_1.default.resolve(root, source);
        // A source that points out of the results directory is not one of the reporter's files.
        if (file.startsWith(root + node_path_1.default.sep)) {
            node_fs_1.default.rmSync(file, { force: true });
        }
        removed += 1;
    };
    for (const name of node_fs_1.default.existsSync(root) ? node_fs_1.default.readdirSync(root) : []) {
        if (!RESULT_FILE.test(name)) {
            continue;
        }
        const file = node_path_1.default.join(root, name);
        const parsed = JSON.parse(node_fs_1.default.readFileSync(file, 'utf8'));
        if ((0, json_values_1.isJsonObject)(parsed)) {
            node_fs_1.default.writeFileSync(file, JSON.stringify(withoutTraces(parsed, deleteAttachment)));
        }
    }
    return { removed };
}
/** A copy of a result node without its trace attachments, and without the steps they leave empty. */
function withoutTraces(node, onTrace) {
    const copy = { ...node };
    if (Array.isArray(node.attachments)) {
        copy.attachments = (0, json_values_1.listOf)(node.attachments).filter(attachment => {
            const source = traceSource(attachment);
            if (source !== undefined) {
                onTrace(source);
            }
            return source === undefined;
        });
    }
    if (Array.isArray(node.steps)) {
        copy.steps = (0, json_values_1.listOf)(node.steps)
            .map(step => ((0, json_values_1.isJsonObject)(step) ? withoutTraces(step, onTrace) : step))
            .filter(step => !isEmptyTraceStep(step));
    }
    return copy;
}
/**
 * The file a trace attachment names, `''` for a trace that has none; `undefined` for an attachment
 * that is not a trace.
 */
function traceSource(attachment) {
    if (!(0, json_values_1.isJsonObject)(attachment)) {
        return undefined;
    }
    const source = (0, json_values_1.textOf)(attachment.source) ?? '';
    return attachment.name === TRACE_NAME || /\.zip$/i.test(source) ? source : undefined;
}
function isEmptyTraceStep(step) {
    return (0, json_values_1.isJsonObject)(step)
        && step.name === TRACE_NAME
        && (0, json_values_1.listOf)(step.attachments).length === 0
        && (0, json_values_1.listOf)(step.steps).length === 0;
}
exports.stripTracesCommand = {
    usage: '[allure-results]',
    summary: 'Takes Playwright traces out of the results the shared report is built from',
    run(args, context) {
        const dir = node_path_1.default.resolve(context.cwd, args[0] ?? 'allure-results');
        const { removed } = stripTraces(dir);
        context.out(`Removed ${String(removed)} trace attachment(s) from ${dir}`);
        return 0;
    },
};
