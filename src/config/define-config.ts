import path from 'node:path';
import type { PlaywrightTestConfig } from '@playwright/test';
import type { EnvironmentVariables } from '../environment/variables';
import { setting, switchSetting } from '../environment/variables';
import type { MagentoTestOptions, MagentoWorkerOptions } from '../fixtures';
import type { ModuleTests } from '../modules/module-tests';
import { moduleTests } from '../modules/module-tests';
import type { MagentoProject } from '../project/project';
import type { DeviceProject } from './devices';
import { deviceOptions, devicesOfRun } from './devices';
import { loadEnvFile } from './env-file';
import { reportersOf } from './reporters';
import { suitesOf } from './suites';

/** What a project's `playwright.config.ts` says about itself. */
export interface MagentoConfigOptions {
    readonly project: MagentoProject;
    /** The directory of `playwright.config.ts` (its `__dirname`): `.env`, `tsconfig.json` and the reports live there. */
    readonly configDir: string;
    /** The storefront-wide tests, relative to `configDir`; `tests` when not given. */
    readonly testDir?: string;
    /** The browsers the tests run in; the default ones when not given. */
    readonly devices?: readonly DeviceProject[];
    /**
     * Whether the run first checks that the default store answers; on when not given.
     * `E2E_PREFLIGHT=off` skips the check for one run.
     */
    readonly preflight?: boolean;
    /** Playwright settings applied last: each top-level key replaces the factory's, `use` is merged one level deep. */
    readonly playwright?: PlaywrightTestConfig;
}

/** A Playwright config whose `use` carries the project and the store a test opens. */
export type MagentoPlaywrightConfig = PlaywrightTestConfig<MagentoTestOptions, MagentoWorkerOptions>;

/** What a run reads from outside its config: the process settings and the installation's modules. */
export interface ConfigInputs {
    readonly variables: EnvironmentVariables;
    readonly modules: readonly ModuleTests[];
    /** The module that runs the storefront check, as Playwright's `globalSetup` names it. */
    readonly preflightModule: string;
    /** The module path of the shared report's Playwright reporter. */
    readonly sharedReporter: string;
}

/**
 * The Playwright config of a Magento project: one project per browser and suite — the storefront-wide
 * tests, the tests of the enabled modules under `app/code`, the tests of the enabled Composer
 * packages — with the environment's settings, the reporters of the run, and a check that the
 * storefront answers before any test starts.
 *
 * The config is evaluated again in every worker, so the project definition, its functions included,
 * reaches the fixtures intact through `use`.
 */
export function defineMagentoConfig(options: MagentoConfigOptions): MagentoPlaywrightConfig {
    loadEnvFile(options.configDir);

    return magentoConfig(options, {
        variables: process.env,
        modules: moduleTests(options.project.magentoRoot),
        // This module's own extension: `.js` once built, `.ts` where a project loads the package's
        // sources. Playwright resolves the setup file as given, with no mapping from one to the other.
        preflightModule: path.join(__dirname, `preflight${path.extname(__filename)}`),
        sharedReporter: require.resolve('allure-playwright'),
    });
}

/** The config `defineMagentoConfig()` makes, from the inputs it read. */
export function magentoConfig(options: MagentoConfigOptions, inputs: ConfigInputs): MagentoPlaywrightConfig {
    const { project, configDir } = options;
    const { variables } = inputs;
    const environment = project.environment(variables);
    const isCi = setting(variables, 'CI') !== undefined;
    const evidence = setting(variables, 'E2E_EVIDENCE') === '1';
    const preflightOn = switchSetting(variables, 'E2E_PREFLIGHT', true) && options.preflight !== false;
    const credentials = environment.httpCredentials();
    const suites = suitesOf({
        configDir,
        testDir: options.testDir ?? 'tests',
        magentoRoot: project.magentoRoot,
        modules: inputs.modules,
    });
    const userAgentSuffix = environment.userAgentSuffix();

    const config: MagentoPlaywrightConfig = {
        outputDir: path.join(configDir, 'test-results'),
        // One tsconfig for every test file, wherever it lives: a module's tests reach the project's
        // own code through the paths it declares.
        tsconfig: path.join(configDir, 'tsconfig.json'),
        fullyParallel: true,
        forbidOnly: isCi,
        retries: isCi ? 2 : 0,
        // A live storefront is rate limited per address; a local one is a single PHP pool.
        workers: environment.workers ?? (environment.targetsProduction() ? 2 : isCi ? 3 : 2),
        timeout: 90_000,
        expect: { timeout: 15_000 },
        reporter: reportersOf({
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
        projects: devicesOfRun(options.devices, variables).flatMap(device => {
            const browser = deviceOptions(device.device);

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
function withOverrides(config: MagentoPlaywrightConfig, overrides: PlaywrightTestConfig | undefined): MagentoPlaywrightConfig {
    if (overrides === undefined) {
        return config;
    }

    return { ...config, ...overrides, use: { ...config.use, ...overrides.use } };
}
