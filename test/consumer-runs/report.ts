/**
 * The parts of Playwright's JSON report the consumer runs assert on, parsed from the report's text.
 */

export interface ReportedProject {
    readonly name: string;
    readonly testDir: string;
}

export interface Annotation {
    readonly type: string;
    readonly description: string | undefined;
}

/** One test in one project, as the run left it. */
export interface ReportedTest {
    /** The spec file, relative to the run's root directory. */
    readonly file: string;
    readonly title: string;
    /** The test's tags, with their `@`. */
    readonly tags: readonly string[];
    readonly project: string;
    /** `expected`, `unexpected`, `skipped` or `flaky`; a run that only lists the tests reports `skipped`. */
    readonly status: string;
    readonly annotations: readonly Annotation[];
    /** The error messages of every attempt. */
    readonly errors: readonly string[];
}

export interface Report {
    readonly projects: readonly ReportedProject[];
    readonly tests: readonly ReportedTest[];
    /** Errors outside any test, such as a failed global setup. */
    readonly errors: readonly string[];
}

type Json = Readonly<Record<string, unknown>>;

export function parseReport(json: string): Report {
    const raw: unknown = JSON.parse(json);
    const report = record(raw, 'report');
    const config = record(report.config, 'config');

    return {
        projects: list(config.projects, 'config.projects').map((entry, index) => {
            const project = record(entry, `config.projects[${String(index)}]`);

            return { name: str(project.name, 'project name'), testDir: str(project.testDir, 'project testDir') };
        }),
        tests: list(report.suites, 'suites').flatMap(suite => testsOf(suite)),
        errors: list(report.errors, 'errors').map(error => str(record(error, 'error').message, 'error message')),
    };
}

function testsOf(value: unknown): readonly ReportedTest[] {
    const suite = record(value, 'suite');
    const specs = suite.specs === undefined ? [] : list(suite.specs, 'specs');
    const suites = suite.suites === undefined ? [] : list(suite.suites, 'suites');

    return [
        ...specs.flatMap(entry => {
            const spec = record(entry, 'spec');
            const file = str(spec.file, 'spec file');
            const title = str(spec.title, 'spec title');
            const tags = list(spec.tags, 'spec tags').map(tag => `@${str(tag, 'tag')}`);

            return list(spec.tests, 'spec tests').map((testEntry): ReportedTest => {
                const test = record(testEntry, 'test');
                const results = list(test.results, 'test results').map(result => record(result, 'result'));

                return {
                    file,
                    title,
                    tags,
                    project: str(test.projectName, 'projectName'),
                    status: str(test.status, 'status'),
                    annotations: annotationsOf(test.annotations),
                    errors: results.flatMap(result => list(result.errors, 'result errors')
                        .map(error => str(record(error, 'error').message, 'error message'))),
                };
            });
        }),
        ...suites.flatMap(child => testsOf(child)),
    ];
}

function annotationsOf(value: unknown): readonly Annotation[] {
    return list(value, 'annotations').map(entry => {
        const annotation = record(entry, 'annotation');
        const description = annotation.description;

        return {
            type: str(annotation.type, 'annotation type'),
            description: typeof description === 'string' ? description : undefined,
        };
    });
}

function record(value: unknown, what: string): Json {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`The JSON report's ${what} is not an object.`);
    }

    return Object.fromEntries(Object.entries(value));
}

function list(value: unknown, what: string): readonly unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`The JSON report's ${what} is not a list.`);
    }

    return value.map((entry: unknown) => entry);
}

function str(value: unknown, what: string): string {
    if (typeof value !== 'string') {
        throw new Error(`The JSON report's ${what} is not a text.`);
    }

    return value;
}
