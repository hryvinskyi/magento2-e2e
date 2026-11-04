import path from 'node:path';
import type { ReporterDescription } from '@playwright/test';

/** What decides the reporters of a run. */
export interface ReportingContext {
    /** The directory every report is written below. */
    readonly configDir: string;
    /** Whether the run is a CI job. */
    readonly isCi: boolean;
    /** Whether the run keeps evidence for a report read outside the team. */
    readonly evidence: boolean;
    /** The environment the run targets, as the shared report names it. */
    readonly environmentName: string;
    /** The commit under test, as the shared report names it; `''` when unknown. */
    readonly commit: string;
    /** What started the run, as the shared report names it. */
    readonly trigger: string;
    /** The module path of the shared report's Playwright reporter. */
    readonly sharedReporter: string;
}

/**
 * The reporters of a run: the console list and the internal HTML report always; on CI also GitHub's
 * annotations and a JUnit file. A run that keeps evidence also writes the results for the shared
 * report (`allure-results/`) and as JSON for a summary (`reports/results.json`). Every file is
 * written below the config's directory, wherever the run was started from.
 */
export function reportersOf(context: ReportingContext): ReporterDescription[] {
    const below = (file: string): string => path.join(context.configDir, file);

    return [
        ['list'],
        ['html', { open: 'never', outputFolder: below('playwright-report') }],
        ...(context.isCi
            ? [['github'], ['junit', { outputFile: below('test-results/junit.xml') }]] satisfies ReporterDescription[]
            : []),
        ...(context.evidence
            ? [
                [context.sharedReporter, {
                    resultsDir: below('allure-results'),
                    detail: false,
                    suiteTitle: true,
                    environmentInfo: {
                        Environment: context.environmentName,
                        Commit: context.commit,
                        Trigger: context.trigger,
                    },
                }],
                ['json', { outputFile: below('reports/results.json') }],
            ] satisfies ReporterDescription[]
            : []),
    ];
}
