export type { EnvironmentName, RegisteredStore, Register, Store, StoreCode, StoreMap } from './project/stores';

export type { EnvironmentVariables } from './environment/variables';
export type {
    BaseUrlResolver,
    Environment,
    EnvironmentDefinition,
    HttpCredentials,
    ProductionWriteGuard,
} from './environment/environment';

export type {
    ConsentPolicy,
    DeferredAssets,
    MagentoProject,
    PageGuard,
    ProjectConfig,
    StorefrontBehaviour,
} from './project/project';
export { defineProject, isMagentoProject } from './project/project';

export type { SafetyTagRule } from './safety/safety-tags';
export { CART_TAG, MUTATING_TAG, READONLY_TAG, SEARCH_SERVICE_TAG } from './safety/safety-tags';

export { perStoreValue } from './stores/per-store-value';

export type { ModuleSource, ModuleTests } from './modules/module-tests';
export { enabledModules, moduleTests } from './modules/module-tests';

export { Storefront } from './storefront/storefront';
export { consentCookie } from './storefront/consent';
export { blockedHosts, clickInside, dismissOnSight, sessionStorageFlag } from './storefront/page-guards';

export type {
    APIRequestContext,
    APIResponse,
    BrowserContext,
    Frame,
    JSHandle,
    Locator,
    MagentoTestFixtures,
    MagentoTestOptions,
    MagentoWorkerFixtures,
    MagentoWorkerOptions,
    Page,
    Request,
    Response,
    Route,
    TestInfo,
} from './fixtures';
export { expect, test } from './fixtures';

export { evidence, keepsEvidence } from './evidence';
export { tabToNextControl } from './keyboard';
export { RequestsInFlight } from './requests-in-flight';
export { Arrivals } from './arrivals';
export { ClickReports } from './click-reports';
export { pageModule } from './page-modules';
export { loadAmdModule } from './node/amd';
export type { DeferredState, JQueryCore, JQueryDeferred, JQueryPromise } from './node/jquery';
export { loadMagentoJQuery } from './node/jquery';

export type { DeviceProject } from './config/devices';
export { DEFAULT_DEVICES } from './config/devices';
export type { MagentoConfigOptions, MagentoPlaywrightConfig } from './config/define-config';
export { defineMagentoConfig } from './config/define-config';
