import { chromium, devices } from '@playwright/test';
import type { FullConfig, LaunchOptions, Page } from '@playwright/test';
import type { MagentoProject } from '../project/project';
import { navigatesThePage } from '../navigation';
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

/**
 * Makes sure the storefront answers before any test starts. A storefront that is down fails every
 * test of the run, each with its retries, for half an hour; this stops the run within a minute and
 * says why. It asks the default store's home page, the page the tests open first, in the browser the
 * tests use and with their login and user agent, so it depends on nothing the tests do not: a client
 * of another kind can be turned away by a firewall that lets the browser through, or fail to reach a
 * local site the browser reaches.
 *
 * It is Playwright's global setup of a config `defineMagentoConfig()` made, and finds the project in
 * that config.
 */
export default async function preflight(config: FullConfig): Promise<void> {
    const project = projectInConfig(config.projects);
    const environment = project.environment();
    const url = environment.baseUrl(project.store(project.defaultStore));
    const credentials = environment.httpCredentials();
    const browser = await chromium.launch(launchOptionsOf(config.projects));

    try {
        const page = await browser.newPage({
            ...devices['Desktop Chrome'],
            javaScriptEnabled: false,
            ignoreHTTPSErrors: environment.ignoresHttpsErrors,
            ...(credentials === undefined ? {} : { httpCredentials: credentials }),
            userAgent: `${devices['Desktop Chrome'].userAgent} ${environment.userAgentSuffix()}`.trim(),
        });

        await askForTheDocumentAlone(page);
        await checkStorefront(environment.name, url, pageProbe(page));
    } finally {
        await browser.close();
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

/**
 * How the run's browser is launched: on the channel the config's `use` names (`channel: 'chrome'`, the
 * Chrome installed on the machine), so the check opens the browser the tests open and needs no other;
 * Playwright's own Chromium when it names none. Every project of a config `defineMagentoConfig()` made
 * holds the config's `use`, so the first one says it.
 */
export function launchOptionsOf(projects: readonly { readonly use: object }[]): LaunchOptions {
    const use = projects[0]?.use;
    const channel = use !== undefined && 'channel' in use ? use.channel : undefined;

    return typeof channel === 'string' && channel !== '' ? { channel } : {};
}

/**
 * Lets only the page itself be fetched: nothing of what it loads is part of the question, and on the
 * live shop none of it (a tracker above all) may run for a check that is no visit. A frame of the page
 * is one of those things, though opening it is a navigation too.
 */
async function askForTheDocumentAlone(page: Page): Promise<void> {
    await page.route('**/*', async route => {
        const request = route.request();

        await (navigatesThePage(request, page) ? route.fallback() : route.abort());
    });
}

/**
 * Asks by opening the page; redirects are followed, a missing answer is described. It waits for the
 * page's `load`, which comes at once with everything else refused: a request still held by the route
 * when the browser closes would be let go to the network.
 */
function pageProbe(page: Page): StorefrontProbe {
    return {
        async answer(url: string): Promise<string> {
            try {
                const response = await page.goto(url, { timeout: REQUEST_TIMEOUT_MS, waitUntil: 'load' });

                return response === null ? 'no answer' : String(response.status());
            } catch (error) {
                return error instanceof Error ? `no answer (${error.message.split('\n')[0] ?? ''})` : 'no answer';
            }
        },
    };
}
