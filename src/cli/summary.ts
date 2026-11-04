import fs from 'node:fs';
import path from 'node:path';
import type { Command } from './context';
import { setting } from '../environment/variables';
import { countOf, isJsonObject, listOf, textOf } from './json-values';
import { reportTitle } from './report-title';

/** How the runs of each trigger are named in the summary. */
const TRIGGER_NAMES: ReadonlyMap<string, string> = new Map([
    ['deployment', 'after deployment'],
    ['nightly', 'nightly check'],
    ['manual', 'manual run'],
]);

/** What a finished run came to, read from Playwright's JSON results. */
export interface RunResults {
    readonly passed: number;
    readonly skipped: number;
    /** Tests that passed on a retry. */
    readonly flaky: readonly string[];
    /** Tests that failed on every try. */
    readonly failed: readonly string[];
}

/** What the summary says about the run besides its results. */
export interface RunFacts {
    /** The words that open the subject: the report's title. */
    readonly title: string;
    readonly environment: string;
    /** What started the run: `deployment`, `nightly`, `manual`, or any other word. */
    readonly trigger: string;
    /** The commit under test; only its first ten characters are shown. */
    readonly commit: string;
    /** Where the full report is; empty when it was not published. */
    readonly reportUrl: string;
    /** The report's login name; its password is never part of a summary. */
    readonly reportUser: string;
}

/** The e-mail a run ends with. */
export interface Summary {
    readonly subject: string;
    readonly html: string;
}

/**
 * Reads Playwright's JSON results. `undefined` when the text is not a results file, so a run that
 * produced none and a run that produced garbage read the same way: it did not run.
 */
export function parseRunResults(text: string): RunResults | undefined {
    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch {
        return undefined;
    }

    if (!isJsonObject(parsed) || !Array.isArray(parsed.suites)) {
        return undefined;
    }

    const failed: string[] = [];
    const flaky: string[] = [];
    const stats = isJsonObject(parsed.stats) ? parsed.stats : {};

    for (const suite of listOf(parsed.suites)) {
        collect(suite, [], { failed, flaky });
    }

    return { passed: countOf(stats.expected), skipped: countOf(stats.skipped), flaky, failed };
}

/** The names of the tests below a suite whose last result is a failure or a pass on retry. */
function collect(suite: unknown, titles: readonly string[], into: { failed: string[]; flaky: string[] }): void {
    if (!isJsonObject(suite)) {
        return;
    }

    const title = textOf(suite.title) ?? '';
    const here = title === '' ? titles : [...titles, title];

    for (const spec of listOf(suite.specs)) {
        if (!isJsonObject(spec)) {
            continue;
        }

        for (const run of listOf(spec.tests)) {
            if (!isJsonObject(run)) {
                continue;
            }

            // The first title is the spec file's, which the project name already places.
            const name = `${[...here.slice(1), textOf(spec.title) ?? ''].join(' › ')} (${textOf(run.projectName) ?? ''})`;

            if (run.status === 'unexpected') {
                into.failed.push(name);
            } else if (run.status === 'flaky') {
                into.flaky.push(name);
            }
        }
    }

    for (const child of listOf(suite.suites)) {
        collect(child, here, into);
    }
}

/**
 * The subject and the body of the summary e-mail. The subject reads
 * `<title> <environment>, <trigger>: <verdict> (<passed>/<total>)`; recipients may filter on it, so
 * its shape is kept.
 */
export function summarize(results: RunResults | undefined, facts: RunFacts): Summary {
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

function namedList(title: string, names: readonly string[]): string {
    return names.length === 0
        ? ''
        : `<h3>${escapeHtml(title)}</h3><ul>${names.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`;
}

function reportLink(facts: RunFacts): string {
    if (facts.reportUrl === '') {
        return '';
    }

    const login = facts.reportUser === ''
        ? ''
        : ` Sign in as <strong>${escapeHtml(facts.reportUser)}</strong> with the password you received separately.`;

    return `<p><a href="${escapeHtml(facts.reportUrl)}">Open the report</a> to see every check with its video and screenshots.${login}</p>`;
}

const HTML_ESCAPES: ReadonlyMap<string, string> = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
]);

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, character => HTML_ESCAPES.get(character) ?? character);
}

export const summaryCommand: Command = {
    usage: '[reports/results.json]',
    summary: 'Writes the summary e-mail of a run from Playwright\'s JSON results',
    run(args, context): number {
        const resultsFile = path.resolve(context.cwd, args[0] ?? path.join('reports', 'results.json'));
        const text = fs.existsSync(resultsFile) ? fs.readFileSync(resultsFile, 'utf8') : undefined;
        const { subject, html } = summarize(text === undefined ? undefined : parseRunResults(text), {
            title: reportTitle(context.variables),
            environment: setting(context.variables, 'E2E_ENV') ?? 'unknown',
            trigger: setting(context.variables, 'E2E_TRIGGER') ?? 'manual',
            commit: setting(context.variables, 'E2E_COMMIT') ?? '',
            reportUrl: setting(context.variables, 'E2E_REPORT_URL') ?? '',
            reportUser: setting(context.variables, 'E2E_REPORT_USER') ?? '',
        });
        const outDir = path.dirname(resultsFile);

        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'summary-subject.txt'), subject);
        fs.writeFileSync(path.join(outDir, 'summary.html'), html);

        const githubOutput = setting(context.variables, 'GITHUB_OUTPUT');

        if (githubOutput !== undefined) {
            fs.appendFileSync(githubOutput, `subject=${subject}\n`);
        }

        context.out(subject);

        return 0;
    },
};
