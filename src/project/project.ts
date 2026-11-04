import type { BrowserContext, Page } from '@playwright/test';
import type { Environment, EnvironmentDefinition, ProductionWriteGuard } from '../environment/environment';
import { createEnvironment } from '../environment/environment';
import type { EnvironmentVariables } from '../environment/variables';
import type { SafetyTagRule } from '../safety/safety-tags';
import { SafetyTagRegistry } from '../safety/safety-tags';
import { ownEntry } from './own-entry';
import { projectProblems } from './project-validation';
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
    /** The environment a run targets, read from these variables (`process.env` by default). */
    environment(variables?: EnvironmentVariables): Environment;
    /** The store with this code; an unknown code is refused with the known ones. */
    store(code: string): RegisteredStore;
    stores(): readonly RegisteredStore[];
    /** Every safety tag of the project: `@readonly`, `@cart`, `@mutating`, then the project's own. */
    safetyTags(): readonly string[];
}

/**
 * Marks the objects `defineProject` made. It is private to this module and set as a non-enumerable
 * property, so neither other code nor a spread copy of a project carries it.
 */
const PROJECT_BRAND: unique symbol = Symbol('MagentoProject');

/**
 * Checks a project definition and returns it frozen. A definition that contradicts itself — a
 * default store that is not one of the stores, a production environment that skips certificate
 * checks — is refused with every problem named.
 */
export function defineProject(config: ProjectConfig): MagentoProject {
    const problems = projectProblems(config);

    if (problems.length > 0) {
        throw new Error(`The project "${config.name}" is not valid: ${problems.join('; ')}.`);
    }

    const storeMap: StoreMap = Object.freeze({ ...config.stores });
    const stores: readonly RegisteredStore[] = Object.freeze(Object.values(storeMap));
    const safetyTags = new SafetyTagRegistry(config.safetyTags ?? {});
    const tags: readonly string[] = Object.freeze(safetyTags.tags());
    const context = Object.freeze({
        stores,
        environments: Object.freeze({ ...config.environments }),
        defaultEnvironment: config.defaultEnvironment,
        safetyTags,
        userAgentSuffix: config.userAgentSuffix,
        productionWriteGuard: config.productionWriteGuard,
    });

    const project: MagentoProject = {
        name: config.name,
        magentoRoot: config.magentoRoot,
        defaultStore: config.defaultStore,
        pageGuards: Object.freeze([...(config.pageGuards ?? [])]),
        blockedRequests: Object.freeze([...(config.blockedRequests ?? [])]),
        storefrontBehaviour: storefrontBehaviourOf(config),
        blockServiceWorkers: config.blockServiceWorkers ?? false,
        environment(variables: EnvironmentVariables = process.env): Environment {
            return createEnvironment(context, variables);
        },
        store(code: string): RegisteredStore {
            const entry = ownEntry(storeMap, code);

            if (entry === undefined) {
                throw new Error(`Unknown store "${code}"; the project's stores are ${Object.keys(storeMap).join(', ')}.`);
            }

            return entry.value;
        },
        stores(): readonly RegisteredStore[] {
            return stores;
        },
        safetyTags(): readonly string[] {
            return tags;
        },
    };

    Object.defineProperty(project, PROJECT_BRAND, { value: true });

    return Object.freeze(project);
}

/**
 * Whether a value is a project `defineProject` made — how code that receives the project through
 * Playwright's configuration narrows it without a cast.
 */
export function isMagentoProject(value: unknown): value is MagentoProject {
    return typeof value === 'object' && value !== null && Object.hasOwn(value, PROJECT_BRAND);
}

function storefrontBehaviourOf(config: ProjectConfig): StorefrontBehaviour {
    const { consent, deferredAssets } = config;

    return Object.freeze({
        ...(consent === undefined ? {} : { consent }),
        ...(deferredAssets === undefined ? {} : { deferredAssets }),
    });
}
