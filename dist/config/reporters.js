"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportersOf = reportersOf;
const node_path_1 = __importDefault(require("node:path"));
/**
 * The reporters of a run: the console list and the internal HTML report always; on CI also GitHub's
 * annotations and a JUnit file. A run that keeps evidence also writes the results for the shared
 * report (`allure-results/`) and as JSON for a summary (`reports/results.json`). Every file is
 * written below the config's directory, wherever the run was started from.
 */
function reportersOf(context) {
    const below = (file) => node_path_1.default.join(context.configDir, file);
    return [
        ['list'],
        ['html', { open: 'never', outputFolder: below('playwright-report') }],
        ...(context.isCi
            ? [['github'], ['junit', { outputFile: below('test-results/junit.xml') }]]
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
            ]
            : []),
    ];
}
