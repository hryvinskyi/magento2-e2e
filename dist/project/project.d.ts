import type { BrowserContext, Page } from '@playwright/test';
import type { Environment, EnvironmentDefinition, ProductionWriteGuard } from '../environment/environment';
import type { EnvironmentVariables } from '../environment/variables';
import type { SafetyTagRule } from '../safety/safety-tags';
import type { PlacementRoute } from '../test-orders/placement';
import type { ShopClient } from '../test-orders/shop';
import type { EnvironmentName, RegisteredStore, StoreCode, StoreMap } from './stores';
/** CSS selectors of the assets a page loads late: run on demand where a test needs them now. */
export interface DeferredAssets {
    /** Stylesheets the page applies late, e.g. `link[data-deferred-href]`. */
    readonly stylesheets?: string;
    /** Scripts the page runs late, e.g. `script[type="text/deferred"]`. */
    readonly scripts?: string;
}
/** Records a visitor's consent before the first page opens, so no consent banner covers the page. */
export interface ConsentPolicy {
    beforeVisit(context: BrowserContext, baseUrl: string): Promise<void>;
}
/** Prepares every page of a test before it opens anything: blocks a host, presets a flag, dismisses an overlay. */
export interface PageGuard {
    install(page: Page): Promise<void>;
}
/** What the storefront object of a test needs to know about the shop's pages. */
export interface StorefrontBehaviour {
    readonly consent?: ConsentPolicy;
    readonly deferredAssets?: DeferredAssets;
}
/** Everything the package needs to know about a Magento project; `defineProject` checks it. */
export interface ProjectConfig {
    /** The shop's name, used in report titles only. */
    readonly name: string;
    /** The absolute path of the Magento installation: where `app/etc/config.php` is read. */
    readonly magentoRoot: string;
    readonly stores: StoreMap;
    readonly defaultStore: StoreCode;
    readonly environments: Readonly<Record<EnvironmentName, EnvironmentDefinition>>;
    /** The environment of a run that does not set `E2E_ENV`. */
    readonly defaultEnvironment: EnvironmentName;
    /**
     * Appended to the browser's user agent, so that the shop's logs and analytics can tell test
     * traffic apart. `E2E_USER_AGENT_SUFFIX` replaces it; absent and unset, nothing is appended.
     */
    readonly userAgentSuffix?: string;
    readonly consent?: ConsentPolicy;
    readonly pageGuards?: readonly PageGuard[];
    /** Requests aborted on the `context` fixture of every test. */
    readonly blockedRequests?: readonly RegExp[];
    readonly deferredAssets?: DeferredAssets;
    /** The project's own safety tags, beside `@readonly`, `@cart` and `@mutating`. */
    readonly safetyTags?: Readonly<Record<string, SafetyTagRule>>;
    /** Keeps a production run's writes on the shop's own origins; absent, nothing is guarded. */
    readonly productionWriteGuard?: ProductionWriteGuard;
    /** Whether service workers are blocked; they always are while writes are guarded. Default false. */
    readonly blockServiceWorkers?: boolean;
    /**
     * The addresses this shop's checkouts turn a cart into an order at, for a test order to be signed
     * and any other write there stopped. Default `[GUEST_PAYMENT_INFORMATION]`, Magento's own checkout;
     * a list replaces it, so a shop with a checkout of its own beside Magento's names both.
     */
    readonly testOrderPlacements?: readonly PlacementRoute[];
    /**
     * Who sends what a test order sends the shop. Default `'runner'`: Node, through Playwright's API client
     * and `route.fetch()`. `'browser'` is for a shop whose firewall answers only a browser, or a machine
     * where Node cannot reach the address: the signed placement and the REST calls both go through the
     * browser. `TestOrderPlacementTerms.client` says what that gives up.
     */
    readonly shopClient?: ShopClient;
}
/** A checked project definition, as `defineProject` returns it. */
export interface MagentoProject {
    readonly name: string;
    readonly magentoRoot: string;
    readonly defaultStore: StoreCode;
    readonly pageGuards: readonly PageGuard[];
    readonly blockedRequests: readonly RegExp[];
    readonly storefrontBehaviour: StorefrontBehaviour;
    readonly blockServiceWorkers: boolean;
    /** The addresses this shop's checkouts turn a cart into an order at. */
    readonly testOrderPlacements: readonly PlacementRoute[];
    /** Who sends what a test order sends the shop. */
    readonly shopClient: ShopClient;
    /** The environment a run targets, read from these variables (`process.env` by default). */
    environment(variables?: EnvironmentVariables): Environment;
    /** The store with this code; an unknown code is refused with the known ones. */
    store(code: string): RegisteredStore;
    stores(): readonly RegisteredStore[];
    /** Every safety tag of the project: `@readonly`, `@cart`, `@mutating`, then the project's own. */
    safetyTags(): readonly string[];
}
/**
 * Checks a project definition and returns it frozen. A definition that contradicts itself — a
 * default store that is not one of the stores, a production environment that skips certificate
 * checks — is refused with every problem named.
 */
export declare function defineProject(config: ProjectConfig): MagentoProject;
/**
 * Whether a value is a project `defineProject` made — how code that receives the project through
 * Playwright's configuration narrows it without a cast.
 */
export declare function isMagentoProject(value: unknown): value is MagentoProject;
