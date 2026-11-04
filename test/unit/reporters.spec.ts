import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ReportingContext } from '../../src/config/reporters';
import { reportersOf } from '../../src/config/reporters';

const CONFIG_DIR = path.join(path.sep, 'srv', 'shop', 'e2e');

function context(overrides: Partial<ReportingContext>): ReportingContext {
    return {
        configDir: CONFIG_DIR,
        isCi: false,
        evidence: false,
        environmentName: 'staging',
        commit: 'abc123',
        trigger: 'deployment',
        sharedReporter: '/modules/shared-reporter/index.js',
        ...overrides,
    };
}

test('a local run reports to the console and the internal HTML report, below the config directory', () => {
    expect(reportersOf(context({}))).toEqual([
        ['list'],
        ['html', { open: 'never', outputFolder: path.join(CONFIG_DIR, 'playwright-report') }],
    ]);
});

test('a CI run adds GitHub\'s annotations and a JUnit file below the config directory', () => {
    expect(reportersOf(context({ isCi: true })).slice(2)).toEqual([
        ['github'],
        ['junit', { outputFile: path.join(CONFIG_DIR, 'test-results', 'junit.xml') }],
    ]);
});

test('a run that keeps evidence writes the shared report\'s results and a JSON summary', () => {
    expect(reportersOf(context({ evidence: true })).slice(2)).toEqual([
        ['/modules/shared-reporter/index.js', {
            resultsDir: path.join(CONFIG_DIR, 'allure-results'),
            detail: false,
            suiteTitle: true,
            environmentInfo: { Environment: 'staging', Commit: 'abc123', Trigger: 'deployment' },
        }],
        ['json', { outputFile: path.join(CONFIG_DIR, 'reports', 'results.json') }],
    ]);
});

test('on CI with evidence every reporter is there, CI\'s first', () => {
    expect(reportersOf(context({ isCi: true, evidence: true })).map(([name]) => name))
        .toEqual(['list', 'html', 'github', 'junit', '/modules/shared-reporter/index.js', 'json']);
});
