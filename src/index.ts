export type { EnvironmentName, RegisteredStore, Register, Store, StoreCode, StoreMap } from './project/stores';

export type { EnvironmentVariables } from './environment/variables';
export type {
    AdminCredentials,
    AdminUrlResolver,
    BaseUrlResolver,
    Environment,
    EnvironmentDefinition,
    HttpCredentials,
    OrderReach,
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
export {
    CART_TAG,
    MUTATING_TAG,
    READONLY_TAG,
    SEARCH_SERVICE_TAG,
    TEST_ORDER_TAG,
    testOrderSafetyRule,
} from './safety/safety-tags';

export type { AdminSettings } from './safety/admin-tag';
export { ADMIN_TAG } from './safety/admin-tag';

export type { AdminMenuItemId, AdminMessageKind } from './admin/admin';
export { Admin } from './admin/admin';
export type { AdminSignIn, AdminStorageState } from './admin/admin-session';
export { AdminSession } from './admin/admin-session';
export { adminRouteOf } from './admin/admin-route';

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

export type { TestOrderAction, UnixClock } from './test-orders/proof';
export { RECOGNITION_SUBJECT, signTestOrderProof, systemClock, TEST_ORDER_PROOF_HEADER, TestOrderProofs } from './test-orders/proof';
export type {
    AbandonedTestOrder,
    Abandonment,
    Recognition,
    ShopAnswer,
    ShopClient,
    ShopRequestOptions,
    ShopRequests,
    TestOrderAbandoner,
} from './test-orders/shop';
export { parseAbandonedTestOrder, TestOrderContractError, TestOrders } from './test-orders/shop';
export { BrowserShopRequests } from './test-orders/browser-requests';
export type { LeftoverCart } from './test-orders/carts';
export { TestOrderCarts } from './test-orders/carts';
export type {
    CaughtRequest,
    PlacedTestOrder,
    PlacementOutcome,
    PlacementRoute,
    PlacementSigner,
    PlacementVerdict,
    SignedPlacements,
    TestOrderPlacementTerms,
} from './test-orders/placement';
export { GUEST_PAYMENT_INFORMATION, judgePlacement, signTestOrderPlacements } from './test-orders/placement';
export type { TestOrderRun } from './test-orders/run';
export { describeAbandonment } from './test-orders/run';

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
