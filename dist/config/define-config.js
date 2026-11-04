"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineMagentoConfig = defineMagentoConfig;
exports.magentoConfig = magentoConfig;
const node_path_1 = __importDefault(require("node:path"));
const variables_1 = require("../environment/variables");
const module_tests_1 = require("../modules/module-tests");
const devices_1 = require("./devices");
const env_file_1 = require("./env-file");
const reporters_1 = require("./reporters");
const suites_1 = require("./suites");
/**
 * The Playwright config of a Magento project: one project per browser and suite — the storefront-wide
 * tests, the tests of the enabled modules under `app/code`, the tests of the enabled Composer
 * packages — with the environment's settings, the reporters of the run, and a check that the
 * storefront answers before any test starts.
 *
 * The config is evaluated again in every worker, so the project definition, its functions included,
 * reaches the fixtures intact through `use`.
 */
function defineMagentoConfig(options) {
    (0, env_file_1.loadEnvFile)(options.configDir);
    return magentoConfig(options, {
        variables: process.env,
        modules: (0, module_tests_1.moduleTests)(options.project.magentoRoot),
        // This module's own extension: `.js` once built, `.ts` where a project loads the package's
        // sources. Playwright resolves the setup file as given, with no mapping from one to the other.
        preflightModule: node_path_1.default.join(__dirname, `preflight${node_path_1.default.extname(__filename)}`),
        sharedReporter: require.resolve('allure-playwright'),
    });
}
/** The config `defineMagentoConfig()` makes, from the inputs it read. */
function magentoConfig(options, inputs) {
    const { project, configDir } = options;
    const { variables } = inputs;
    const environment = project.environment(variables);
    const isCi = (0, variables_1.setting)(variables, 'CI') !== undefined;
    const evidence = (0, variables_1.setting)(variables, 'E2E_EVIDENCE') === '1';
    const preflightOn = (0, variables_1.switchSetting)(variables, 'E2E_PREFLIGHT', true) && options.preflight !== false;
    const credentials = environment.httpCredentials();
    const suites = (0, suites_1.suitesOf)({
        configDir,
        testDir: options.testDir ?? 'tests',
        magentoRoot: project.magentoRoot,
        modules: inputs.modules,
    });
    const userAgentSuffix = environment.userAgentSuffix();
    const config = {
        outputDir: node_path_1.default.join(configDir, 'test-results'),
        // One tsconfig for every test file, wherever it lives: a module's tests reach the project's
        // own code through the paths it declares.
        tsconfig: node_path_1.default.join(configDir, 'tsconfig.json'),
        fullyParallel: true,
        forbidOnly: isCi,
        retries: isCi ? 2 : 0,
        // A live storefront is rate limited per address; a local one is a single PHP pool.
        workers: environment.workers ?? (environment.targetsProduction() ? 2 : isCi ? 3 : 2),
        timeout: 90_000,
        expect: { timeout: 15_000 },
        reporter: (0, reporters_1.reportersOf)({
            configDir,
            isCi,
            evidence,
            environmentName: environment.name,
            commit: variables.E2E_COMMIT ?? '',
            trigger: variables.E2E_TRIGGER ?? 'manual',
            sharedReporter: inputs.sharedReporter,
        }),
        metadata: { environment: environment.name },
        ...(preflightOn ? { globalSetup: inputs.preflightModule } : {}),
        use: {
            actionTimeout: 20_000,
            navigationTimeout: 60_000,
            trace: 'retain-on-failure',
            screenshot: evidence ? 'on' : 'only-on-failure',
            video: evidence ? 'on' : 'retain-on-failure',
            ignoreHTTPSErrors: environment.ignoresHttpsErrors,
            ...(credentials === undefined ? {} : { httpCredentials: credentials }),
            magentoProject: project,
            storeCode: project.defaultStore,
        },
        projects: (0, devices_1.devicesOfRun)(options.devices, variables).flatMap(device => {
            const browser = (0, devices_1.deviceOptions)(device.device);
            return suites.map(suite => ({
                name: `${device.name}${suite.suffix}`,
                testDir: suite.testDir,
                testMatch: typeof suite.testMatch === 'string' ? suite.testMatch : [...suite.testMatch],
                ...(device.grep === undefined ? {} : { grep: device.grep }),
                ...(device.grepInvert === undefined ? {} : { grepInvert: device.grepInvert }),
                use: { ...browser, userAgent: `${browser.userAgent} ${userAgentSuffix}`.trim() },
            }));
        }),
    };
    return withOverrides(config, options.playwright);
}
/** The project's own Playwright settings over the factory's: top-level keys replace, `use` merges one level deep. */
function withOverrides(config, overrides) {
    if (overrides === undefined) {
        return config;
    }
    return { ...config, ...overrides, use: { ...config.use, ...overrides.use } };
}
