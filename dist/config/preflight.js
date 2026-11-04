"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SCHEDULE = void 0;
exports.default = preflight;
exports.checkStorefront = checkStorefront;
exports.projectInConfig = projectInConfig;
const test_1 = require("@playwright/test");
const project_1 = require("../project/project");
/** Three tries, ten seconds apart: long enough for a freshly deployed storefront to warm its caches. */
exports.DEFAULT_SCHEDULE = Object.freeze({
    attempts: 3,
    pauseMs: 10_000,
    pause: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
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
async function preflight(config) {
    const project = projectInConfig(config.projects);
    const environment = project.environment();
    const url = environment.baseUrl(project.store(project.defaultStore));
    const credentials = environment.httpCredentials();
    const browser = await test_1.chromium.launch();
    try {
        const page = await browser.newPage({
            ...test_1.devices['Desktop Chrome'],
            javaScriptEnabled: false,
            ignoreHTTPSErrors: environment.ignoresHttpsErrors,
            ...(credentials === undefined ? {} : { httpCredentials: credentials }),
            userAgent: `${test_1.devices['Desktop Chrome'].userAgent} ${environment.userAgentSuffix()}`.trim(),
        });
        await askForTheDocumentAlone(page);
        await checkStorefront(environment.name, url, pageProbe(page));
    }
    finally {
        await browser.close();
    }
}
/**
 * Asks for `url` until it answers 200, pausing between tries; refuses the run when no try did.
 */
async function checkStorefront(environmentName, url, probe, schedule = exports.DEFAULT_SCHEDULE) {
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
    throw new Error(`The ${environmentName} storefront is not answering: ${url} gave ${answer} ${String(schedule.attempts)} `
        + `times over ${String(seconds)} seconds. No check was run.`);
}
/**
 * The project of a config `defineMagentoConfig()` made: every project of such a config carries it
 * in its `use`.
 */
function projectInConfig(projects) {
    const use = projects[0]?.use;
    const project = use !== undefined && 'magentoProject' in use ? use.magentoProject : undefined;
    if (!(0, project_1.isMagentoProject)(project)) {
        throw new Error('The storefront check found no Magento project in the Playwright config: it runs only as the global '
            + 'setup of a config made by defineMagentoConfig().');
    }
    return project;
}
/**
 * Lets only the page itself be fetched: nothing of what it loads is part of the question, and on the
 * live shop none of it (a tracker above all) may run for a check that is no visit. A frame of the page
 * is one of those things, though opening it is a navigation too.
 */
async function askForTheDocumentAlone(page) {
    await page.route('**/*', async (route) => {
        const request = route.request();
        await (request.isNavigationRequest() && request.frame() === page.mainFrame() ? route.fallback() : route.abort());
    });
}
/**
 * Asks by opening the page; redirects are followed, a missing answer is described. It waits for the
 * page's `load`, which comes at once with everything else refused: a request still held by the route
 * when the browser closes would be let go to the network.
 */
function pageProbe(page) {
    return {
        async answer(url) {
            try {
                const response = await page.goto(url, { timeout: REQUEST_TIMEOUT_MS, waitUntil: 'load' });
                return response === null ? 'no answer' : String(response.status());
            }
            catch (error) {
                return error instanceof Error ? `no answer (${error.message.split('\n')[0] ?? ''})` : 'no answer';
            }
        },
    };
}
