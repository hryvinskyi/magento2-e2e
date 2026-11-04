import type { PlaywrightTestConfig } from '@playwright/test';
import type { EnvironmentVariables } from '../environment/variables';
import type { MagentoTestOptions, MagentoWorkerOptions } from '../fixtures';
import type { ModuleTests } from '../modules/module-tests';
import type { MagentoProject } from '../project/project';
import type { DeviceProject } from './devices';
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
export declare function defineMagentoConfig(options: MagentoConfigOptions): MagentoPlaywrightConfig;
/** The config `defineMagentoConfig()` makes, from the inputs it read. */
export declare function magentoConfig(options: MagentoConfigOptions, inputs: ConfigInputs): MagentoPlaywrightConfig;
