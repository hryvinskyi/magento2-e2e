"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryCommand = void 0;
exports.parseRunResults = parseRunResults;
exports.summarize = summarize;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const variables_1 = require("../environment/variables");
const json_values_1 = require("./json-values");
const report_title_1 = require("./report-title");
/** How the runs of each trigger are named in the summary. */
const TRIGGER_NAMES = new Map([
    ['deployment', 'after deployment'],
    ['nightly', 'nightly check'],
    ['manual', 'manual run'],
]);
/**
 * Reads Playwright's JSON results. `undefined` when the text is not a results file, so a run that
 * produced none and a run that produced garbage read the same way: it did not run.
 */
function parseRunResults(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    if (!(0, json_values_1.isJsonObject)(parsed) || !Array.isArray(parsed.suites)) {
        return undefined;
    }
    const failed = [];
    const flaky = [];
    const stats = (0, json_values_1.isJsonObject)(parsed.stats) ? parsed.stats : {};
    for (const suite of (0, json_values_1.listOf)(parsed.suites)) {
        collect(suite, [], { failed, flaky });
    }
    return { passed: (0, json_values_1.countOf)(stats.expected), skipped: (0, json_values_1.countOf)(stats.skipped), flaky, failed };
}
/** The names of the tests below a suite whose last result is a failure or a pass on retry. */
function collect(suite, titles, into) {
    if (!(0, json_values_1.isJsonObject)(suite)) {
        return;
    }
    const title = (0, json_values_1.textOf)(suite.title) ?? '';
    const here = title === '' ? titles : [...titles, title];
    for (const spec of (0, json_values_1.listOf)(suite.specs)) {
        if (!(0, json_values_1.isJsonObject)(spec)) {
            continue;
        }
        for (const run of (0, json_values_1.listOf)(spec.tests)) {
            if (!(0, json_values_1.isJsonObject)(run)) {
                continue;
            }
            // The first title is the spec file's, which the project name already places.
            const name = `${[...here.slice(1), (0, json_values_1.textOf)(spec.title) ?? ''].join(' › ')} (${(0, json_values_1.textOf)(run.projectName) ?? ''})`;
            if (run.status === 'unexpected') {
                into.failed.push(name);
            }
            else if (run.status === 'flaky') {
                into.flaky.push(name);
            }
        }
    }
    for (const child of (0, json_values_1.listOf)(suite.suites)) {
        collect(child, here, into);
    }
}
/**
 * The subject and the body of the summary e-mail. The subject reads
 * `<title> <environment>, <trigger>: <verdict> (<passed>/<total>)`; recipients may filter on it, so
 * its shape is kept.
 */
function summarize(results, facts) {
    const trigger = TRIGGER_NAMES.get(facts.trigger) ?? facts.trigger;
    const commit = facts.commit.slice(0, 10);
    const verdict = results === undefined ? 'did not run' : results.failed.length > 0 ? `${String(results.failed.length)} failed` : 'all passed';
    const counts = results === undefined
        ? ''
        : ` (${String(results.passed + results.flaky.length)}/${String(results.passed + results.failed.length + results.flaky.length)})`;
    const subject = `${facts.title} ${facts.environment}, ${trigger}: ${verdict}${counts}`;
    const lines = [
        `Environment: ${escapeHtml(facts.environment)}`,
        `Run: ${escapeHtml(trigger)}`,
        ...(commit === '' ? [] : [`Release: ${escapeHtml(commit)}`]),
    ];
    const html = `<!doctype html><html><body style="font-family: sans-serif; line-height: 1.5">
<p><strong>${escapeHtml(subject)}</strong></p>
<p>${lines.join('<br>')}</p>
${results === undefined
        ? '<p>The checks did not produce results; see the workflow run.</p>'
        : `<p>Passed: ${String(results.passed)}. Failed: ${String(results.failed.length)}. Passed on a second try: ${String(results.flaky.length)}. Skipped: ${String(results.skipped)}.</p>`}
${namedList('Failed', results?.failed ?? [])}
${namedList('Passed on a second try', results?.flaky ?? [])}
${reportLink(facts)}
</body></html>
`;
    return { subject, html };
}
function namedList(title, names) {
    return names.length === 0
        ? ''
        : `<h3>${escapeHtml(title)}</h3><ul>${names.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`;
}
function reportLink(facts) {
    if (facts.reportUrl === '') {
        return '';
    }
    const login = facts.reportUser === ''
        ? ''
        : ` Sign in as <strong>${escapeHtml(facts.reportUser)}</strong> with the password you received separately.`;
    return `<p><a href="${escapeHtml(facts.reportUrl)}">Open the report</a> to see every check with its video and screenshots.${login}</p>`;
}
const HTML_ESCAPES = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
]);
function escapeHtml(text) {
    return text.replace(/[&<>"]/g, character => HTML_ESCAPES.get(character) ?? character);
}
exports.summaryCommand = {
    usage: '[reports/results.json]',
    summary: 'Writes the summary e-mail of a run from Playwright\'s JSON results',
    run(args, context) {
        const resultsFile = node_path_1.default.resolve(context.cwd, args[0] ?? node_path_1.default.join('reports', 'results.json'));
        const text = node_fs_1.default.existsSync(resultsFile) ? node_fs_1.default.readFileSync(resultsFile, 'utf8') : undefined;
        const { subject, html } = summarize(text === undefined ? undefined : parseRunResults(text), {
            title: (0, report_title_1.reportTitle)(context.variables),
            environment: (0, variables_1.setting)(context.variables, 'E2E_ENV') ?? 'unknown',
            trigger: (0, variables_1.setting)(context.variables, 'E2E_TRIGGER') ?? 'manual',
            commit: (0, variables_1.setting)(context.variables, 'E2E_COMMIT') ?? '',
            reportUrl: (0, variables_1.setting)(context.variables, 'E2E_REPORT_URL') ?? '',
            reportUser: (0, variables_1.setting)(context.variables, 'E2E_REPORT_USER') ?? '',
        });
        const outDir = node_path_1.default.dirname(resultsFile);
        node_fs_1.default.mkdirSync(outDir, { recursive: true });
        node_fs_1.default.writeFileSync(node_path_1.default.join(outDir, 'summary-subject.txt'), subject);
        node_fs_1.default.writeFileSync(node_path_1.default.join(outDir, 'summary.html'), html);
        const githubOutput = (0, variables_1.setting)(context.variables, 'GITHUB_OUTPUT');
        if (githubOutput !== undefined) {
            node_fs_1.default.appendFileSync(githubOutput, `subject=${subject}\n`);
        }
        context.out(subject);
        return 0;
    },
};
