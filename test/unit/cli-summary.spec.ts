import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { parseRunResults, summarize, summaryCommand } from '../../src/cli/summary';
import type { RunFacts } from '../../src/cli/summary';
import type { EnvironmentVariables } from '../../src/environment/variables';
import { temporaryDirectory } from './temporary-files';

const FACTS: RunFacts = {
    title: 'Acme storefront',
    environment: 'staging',
    trigger: 'deployment',
    commit: '0123456789abcdef',
    reportUrl: 'https://reports.example.com/run-1',
    reportUser: 'reader',
};

function results(stats: Record<string, number>, suites: unknown[]): string {
    return JSON.stringify({ stats, suites });
}

const passing = (title: string): unknown => ({ title, projectName: 'desktop', status: 'expected' });

const ALL_PASSED = results({ expected: 3, unexpected: 0, flaky: 0, skipped: 1 }, [
    { title: 'home.spec.ts', specs: [{ title: 'opens', tests: [passing('opens'), passing('opens')] }] },
]);

const WITH_FAILURES = results({ expected: 1, unexpected: 1, flaky: 1, skipped: 0 }, [
    {
        title: 'cart.spec.ts',
        specs: [],
        suites: [
            {
                title: 'the cart',
                specs: [
                    { title: 'keeps <items>', tests: [{ projectName: 'mobile', status: 'unexpected' }] },
                    { title: 'adds a product', tests: [{ projectName: 'desktop', status: 'flaky' }] },
                    { title: 'is empty', tests: [{ projectName: 'desktop', status: 'expected' }] },
                ],
            },
        ],
    },
]);

test('a run in which everything passed', () => {
    const summary = summarize(parseRunResults(ALL_PASSED), FACTS);

    expect(summary.subject).toBe('Acme storefront staging, after deployment: all passed (3/3)');
    expect(summary.html).toContain('Passed: 3. Failed: 0. Passed on a second try: 0. Skipped: 1.');
    expect(summary.html).toContain('Release: 0123456789');
    expect(summary.html).not.toContain('abcdef');
    expect(summary.html).toContain('<a href="https://reports.example.com/run-1">Open the report</a>');
    expect(summary.html).toContain('Sign in as <strong>reader</strong>');
    expect(summary.html).not.toContain('<h3>');
});

test('failed and flaky tests are named with their project, and escaped', () => {
    const summary = summarize(parseRunResults(WITH_FAILURES), { ...FACTS, trigger: 'nightly' });

    expect(summary.subject).toBe('Acme storefront staging, nightly check: 1 failed (2/3)');
    expect(summary.html).toContain('<h3>Failed</h3><ul><li>the cart › keeps &lt;items&gt; (mobile)</li></ul>');
    expect(summary.html).toContain('<h3>Passed on a second try</h3><ul><li>the cart › adds a product (desktop)</li></ul>');
});

test('a trigger the summary does not know is shown as it is, and a missing commit and report are left out', () => {
    const summary = summarize(parseRunResults(ALL_PASSED), { ...FACTS, trigger: 'hotfix', commit: '', reportUrl: '' });

    expect(summary.subject).toContain('staging, hotfix: all passed');
    expect(summary.html).not.toContain('Release:');
    expect(summary.html).not.toContain('Open the report');
});

test('no results file, or one that is not a results file, reads as a run that did not run', () => {
    for (const text of [undefined, parseRunResults('not json'), parseRunResults('{"stats":{}}'), parseRunResults('[]')]) {
        const summary = summarize(text, FACTS);

        expect(summary.subject).toBe('Acme storefront staging, after deployment: did not run');
        expect(summary.html).toContain('The checks did not produce results; see the workflow run.');
    }
});

function runCommand(variables: EnvironmentVariables, files: Record<string, string>): { code: number; dir: string; lines: string[] } {
    const dir = temporaryDirectory(files);
    const lines: string[] = [];
    const code = summaryCommand.run([], {
        variables,
        cwd: dir,
        out: line => lines.push(line),
        err: line => lines.push(line),
    });

    return { code, dir, lines };
}

test('the command writes the subject and the page next to the results and appends the subject to GITHUB_OUTPUT', () => {
    const output = temporaryDirectory({ 'github-output': 'existing=1\n' });
    const outputFile = path.join(output, 'github-output');
    const run = runCommand(
        {
            E2E_REPORT_TITLE: 'Acme storefront',
            E2E_ENV: 'production',
            E2E_TRIGGER: 'manual',
            E2E_COMMIT: 'abc',
            E2E_REPORT_URL: 'https://reports.example.com/',
            E2E_REPORT_USER: 'reader',
            E2E_REPORT_PASSWORD: 'never-in-the-page',
            GITHUB_OUTPUT: outputFile,
        },
        { 'reports/results.json': WITH_FAILURES },
    );

    try {
        const subject = 'Acme storefront production, manual run: 1 failed (2/3)';
        const html = fs.readFileSync(path.join(run.dir, 'reports', 'summary.html'), 'utf8');

        expect(run.code).toBe(0);
        expect(run.lines).toEqual([subject]);
        expect(fs.readFileSync(path.join(run.dir, 'reports', 'summary-subject.txt'), 'utf8')).toBe(subject);
        expect(html).toContain(subject);
        expect(html).not.toContain('never-in-the-page');
        expect(fs.readFileSync(outputFile, 'utf8')).toBe(`existing=1\nsubject=${subject}\n`);
    } finally {
        fs.rmSync(run.dir, { recursive: true });
        fs.rmSync(output, { recursive: true });
    }
});

test('the command with no results file and no settings still writes a summary, under the default title', () => {
    const run = runCommand({}, {});

    try {
        const subject = 'Storefront checks unknown, manual run: did not run';

        expect(run.code).toBe(0);
        expect(fs.readFileSync(path.join(run.dir, 'reports', 'summary-subject.txt'), 'utf8')).toBe(subject);
        expect(fs.existsSync(path.join(run.dir, 'reports', 'summary.html'))).toBe(true);
    } finally {
        fs.rmSync(run.dir, { recursive: true });
    }
});
