import { devices, request } from '@playwright/test';
import type { APIRequestContext, FullConfig } from '@playwright/test';
import type { MagentoProject } from '../project/project';
import { isMagentoProject } from '../project/project';

/** Asks for a page and says how it answered. */
export interface StorefrontProbe {
    /** The HTTP status of the answer, or what went wrong when there was none. */
    answer(url: string): Promise<string>;
}

/** How often, and how far apart, the storefront is asked. */
export interface PreflightSchedule {
    readonly attempts: number;
    readonly pauseMs: number;
    pause(ms: number): Promise<void>;
}

/** Three tries, ten seconds apart: long enough for a freshly deployed storefront to warm its caches. */
export const DEFAULT_SCHEDULE: PreflightSchedule = Object.freeze({
    attempts: 3,
    pauseMs: 10_000,
    pause: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
});

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;

/**
 * Makes sure the storefront answers before any test starts. A storefront that is down fails every
 * test of the run, each with its retries, for half an hour; this stops the run within a minute and
 * says why. It asks the default store's home page, the page the tests open first, with the login
 * and the user agent the tests use, so it depends on nothing the tests do not.
 *
 * It is Playwright's global setup of a config `defineMagentoConfig()` made, and finds the project in
 * that config.
 */
export default async function preflight(config: FullConfig): Promise<void> {
    const project = projectInConfig(config.projects);
    const environment = project.environment();
    const url = environment.baseUrl(project.store(project.defaultStore));
    const credentials = environment.httpCredentials();
    const context = await request.newContext({
        ignoreHTTPSErrors: environment.ignoresHttpsErrors,
        ...(credentials === undefined ? {} : { httpCredentials: credentials }),
        userAgent: `${devices['Desktop Chrome'].userAgent} ${environment.userAgentSuffix()}`.trim(),
    });

    try {
        await checkStorefront(environment.name, url, requestProbe(context));
    } finally {
        await context.dispose();
    }
}

/**
 * Asks for `url` until it answers 200, pausing between tries; refuses the run when no try did.
 */
export async function checkStorefront(
    environmentName: string,
    url: string,
    probe: StorefrontProbe,
    schedule: PreflightSchedule = DEFAULT_SCHEDULE,
): Promise<void> {
    let answer = '';

    for (let attempt = 1; attempt <= schedule.attempts; attempt++) {
        answer = await probe.answer(url);

        if (answer === '200') {
            return;
        }

        if (attempt < schedule.attempts) {
            await schedule.pause(schedule.pauseMs);
        }
    }

    const seconds = ((schedule.attempts - 1) * schedule.pauseMs) / 1_000;

    throw new Error(
        `The ${environmentName} storefront is not answering: ${url} gave ${answer} ${String(schedule.attempts)} `
        + `times over ${String(seconds)} seconds. No check was run.`,
    );
}

/**
 * The project of a config `defineMagentoConfig()` made: every project of such a config carries it
 * in its `use`.
 */
export function projectInConfig(projects: readonly { readonly use: object }[]): MagentoProject {
    const use = projects[0]?.use;
    const project = use !== undefined && 'magentoProject' in use ? use.magentoProject : undefined;

    if (!isMagentoProject(project)) {
        throw new Error(
            'The storefront check found no Magento project in the Playwright config: it runs only as the global '
            + 'setup of a config made by defineMagentoConfig().',
        );
    }

    return project;
}

/** Asks with the run's request context; redirects are followed, a missing answer is described. */
function requestProbe(context: APIRequestContext): StorefrontProbe {
    return {
        async answer(url: string): Promise<string> {
            try {
                const response = await context.get(url, { timeout: REQUEST_TIMEOUT_MS, maxRedirects: MAX_REDIRECTS });

                return String(response.status());
            } catch (error) {
                return error instanceof Error ? `no answer (${error.message.split('\n')[0] ?? ''})` : 'no answer';
            }
        },
    };
}
