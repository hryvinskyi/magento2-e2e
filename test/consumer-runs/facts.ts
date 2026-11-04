import type { Received } from './consumer-run';
import type { Report, ReportedTest } from './report';

/** What a test without exactly one safety tag fails with. */
export const SAFETY_MESSAGE = 'A test declares exactly one of @readonly, @cart, @mutating;';

/** The project names a run of the consumer has: two browsers, each over the four suites. */
export const PROJECT_NAMES: readonly string[] = [
    'desktop',
    'desktop-modules',
    'desktop-packages-packages',
    'desktop-packages-vendor',
    'mobile',
    'mobile-modules',
    'mobile-packages-packages',
    'mobile-packages-vendor',
];

/** The one test of this title in this project; the run fails the spec when there is none or several. */
export function testIn(report: Report, project: string, title: string): ReportedTest {
    const found = report.tests.filter(test => test.project === project && test.title === title);
    const [test, ...more] = found;

    if (test === undefined || more.length > 0) {
        throw new Error(`Expected one test "${title}" in ${project}; found ${String(found.length)}.`);
    }

    return test;
}

/** The descriptions of a test's annotations of one type. */
export function annotated(test: ReportedTest, type: string): readonly (string | undefined)[] {
    return test.annotations.filter(annotation => annotation.type === type).map(annotation => annotation.description);
}

/** The paths of the requests that reached the page server. */
export function receivedPaths(received: readonly Received[]): readonly string[] {
    return received.map(request => request.path);
}
