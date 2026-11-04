import { ownEntry } from '../project/own-entry';
import type { EnvironmentName, RegisteredStore } from '../project/stores';
import type { SafetyTagRegistry } from '../safety/safety-tags';
import type { EnvironmentVariables } from './variables';
import { setting, storeSettingName, switchSetting } from './variables';

/**
 * How an environment turns a store into its base URL; the variables are those of the run.
 *
 * A run outside production asks for the address of every store, because that is how it finds out it
 * reaches the live shop: its own environment's resolver for each store without an `E2E_BASE_URL_<CODE>`,
 * and each production environment's resolver. A resolver that throws therefore stops the whole run, also
 * one that opens a single overridden store, and a production environment's may not depend on a setting
 * only a production run has.
 */
export type BaseUrlResolver = (store: RegisteredStore, variables: EnvironmentVariables) => string;

/** How far a test order goes: until the payment provider's window has opened, or paid up to the order confirmation. */
export type OrderReach = 'payment-window' | 'success-page';

/** One environment a project's tests run against: a local copy, a staging server, the live shop. */
export interface EnvironmentDefinition {
    readonly baseUrl: BaseUrlResolver;
    /** Whether this is the live shop. Tests run here only when a safety tag allows production. */
    readonly production?: boolean;
    /** Whether the browser accepts a certificate it cannot verify, as a local copy's often is. Never on production. */
    readonly ignoreHttpsErrors?: boolean;
    /** Whether `E2E_SEARCH_SERVICE=off` is accepted here. Never on production. */
    readonly searchServiceOptional?: boolean;
    /** How many workers a run against this environment uses; unset, `defineMagentoConfig()` chooses. */
    readonly workers?: number;
    /**
     * Whether a test order is paid here, with the provider's test card. Set it only where the shop is
     * known to run on the provider's test keys. A run that reaches the live shop never pays, whatever
     * this says.
     */
    readonly paysTestOrders?: boolean;
}

/**
 * Keeps the writes of a run against the live shop on the shop's own origins. Present means on.
 */
export interface ProductionWriteGuard {
    /** Origins besides the stores' own that a guarded run may still write to. */
    readonly allowedOrigins?: readonly string[];
}

export interface HttpCredentials {
    readonly username: string;
    readonly password: string;
}

/**
 * The environment one run targets, with every setting read from the variables it was made with.
 */
export interface Environment {
    readonly name: EnvironmentName;
    readonly isProduction: boolean;
    /** Whether the search service answers here; `E2E_SEARCH_SERVICE=off` switches it off where that is accepted. */
    readonly hasSearchService: boolean;
    readonly ignoresHttpsErrors: boolean;
    readonly workers: number | undefined;
    /** The store's base URL here, always with a trailing slash; an http(s) URL in `E2E_BASE_URL_<CODE>` replaces it. */
    baseUrl(store: RegisteredStore): string;
    /** Whether a test carrying these tags may run here. */
    allows(tags: readonly string[]): boolean;
    /** Why a test carrying these tags may not run here; nothing when it may. */
    refusal(tags: readonly string[]): string | undefined;
    /** The HTTP authentication of the site (`E2E_HTTP_USER`, `E2E_HTTP_PASSWORD`); nothing without a user. */
    httpCredentials(): HttpCredentials | undefined;
    /** What is appended to the browser's user agent; `''` when nothing is. */
    userAgentSuffix(): string;
    /**
     * Whether a URL belongs to the live shop: its host is, or is a subdomain of, the host of a store's
     * base URL in an environment marked production, without a leading `www.`.
     */
    isProductionOrigin(url: string): boolean;
    /**
     * Whether this run reaches the live shop: its environment is marked production, or a store's base
     * URL here has the host of a store in an environment marked production, without a leading `www.`.
     * The hosts must be equal: a staging site on a subdomain of the live shop is not the live shop.
     */
    targetsProduction(): boolean;
    /** Whether this run's writes are kept on the shop's own origins: it targets production and the project has a write guard. */
    guardsWrites(): boolean;
    /** The origins a guarded run may write to: every store's here, and the guard's allowed ones. */
    shopOrigins(): ReadonlySet<string>;
    /**
     * Every store's base URL here, and nothing else. A test order's proof goes to these only, so unlike
     * `shopOrigins()` this holds none of the partners a guarded run may write to.
     */
    storeBaseUrls(): readonly string[];
    /** The secret a test order's proofs are made with (`E2E_TEST_ORDER_SECRET`), trimmed; an empty one reads as unset. */
    testOrderSecret(): string | undefined;
    /**
     * How far a test order goes in this run: to the order confirmation only where the environment says
     * `paysTestOrders` and the run does not target production, up to the payment window everywhere
     * else. A local copy without the setting never pays, as it may hold live keys; a staging site on a
     * subdomain of the live shop is not the live shop and may.
     */
    testOrderReach(): OrderReach;
    /** A setting of the project's own, trimmed; an empty one reads as unset. */
    variable(name: string): string | undefined;
}

/** What an environment needs to know about the project it belongs to. */
export interface EnvironmentContext {
    readonly stores: readonly RegisteredStore[];
    readonly environments: Readonly<Record<EnvironmentName, EnvironmentDefinition>>;
    readonly defaultEnvironment: EnvironmentName;
    readonly safetyTags: SafetyTagRegistry;
    readonly userAgentSuffix: string | undefined;
    readonly productionWriteGuard: ProductionWriteGuard | undefined;
}

/**
 * The environment `E2E_ENV` names, or the project's default one when it is unset. An unknown name is
 * refused with the known ones, so a typing mistake never runs against an environment nobody chose.
 */
export function createEnvironment(context: EnvironmentContext, variables: EnvironmentVariables): Environment {
    const name = setting(variables, 'E2E_ENV') ?? context.defaultEnvironment;
    const entry = ownEntry(context.environments, name);

    if (entry === undefined) {
        throw new Error(
            `E2E_ENV must be one of ${Object.keys(context.environments).join(', ')}; got "${name}".`,
        );
    }

    return new RunEnvironment(entry.key, entry.value, context, variables);
}

class RunEnvironment implements Environment {
    public readonly name: EnvironmentName;
    public readonly isProduction: boolean;
    public readonly hasSearchService: boolean;
    public readonly ignoresHttpsErrors: boolean;
    public readonly workers: number | undefined;
    private readonly definition: EnvironmentDefinition;
    private readonly context: EnvironmentContext;
    private readonly variables: EnvironmentVariables;
    private productionDomainsOnce: ReadonlySet<string> | undefined;

    public constructor(
        name: EnvironmentName,
        definition: EnvironmentDefinition,
        context: EnvironmentContext,
        variables: EnvironmentVariables,
    ) {
        this.name = name;
        this.definition = definition;
        this.context = context;
        this.variables = variables;
        this.isProduction = definition.production === true;
        this.ignoresHttpsErrors = definition.ignoreHttpsErrors === true;
        this.workers = definition.workers;
        this.hasSearchService = searchServiceSwitch(name, context, variables);
    }

    public baseUrl(store: RegisteredStore): string {
        const name = storeSettingName('BASE_URL', store.code);
        const override = setting(this.variables, name);

        if (override !== undefined && !isHttpAddress(override)) {
            throw new Error(`${name} must be an absolute http(s) URL; got "${override}".`);
        }

        return withTrailingSlash(override ?? this.definition.baseUrl(store, this.variables));
    }

    public allows(tags: readonly string[]): boolean {
        return this.refusal(tags) === undefined;
    }

    public refusal(tags: readonly string[]): string | undefined {
        return this.context.safetyTags.refusal(tags, this);
    }

    public httpCredentials(): HttpCredentials | undefined {
        const username = setting(this.variables, 'E2E_HTTP_USER');

        return username === undefined
            ? undefined
            : { username, password: this.variables.E2E_HTTP_PASSWORD ?? '' };
    }

    public userAgentSuffix(): string {
        return setting(this.variables, 'E2E_USER_AGENT_SUFFIX') ?? this.context.userAgentSuffix?.trim() ?? '';
    }

    public isProductionOrigin(url: string): boolean {
        const host = hostWithoutWww(url);

        return [...this.productionDomains()].some(domain => host === domain || host.endsWith(`.${domain}`));
    }

    public targetsProduction(): boolean {
        return this.isProduction
            || this.context.stores.some(store => this.productionDomains().has(hostWithoutWww(this.baseUrl(store))));
    }

    public guardsWrites(): boolean {
        return this.context.productionWriteGuard !== undefined && this.targetsProduction();
    }

    public shopOrigins(): ReadonlySet<string> {
        const allowed = this.context.productionWriteGuard?.allowedOrigins ?? [];

        return new Set([
            ...this.context.stores.map(store => new URL(this.baseUrl(store)).origin),
            ...allowed.map(origin => new URL(origin).origin),
        ]);
    }

    public storeBaseUrls(): readonly string[] {
        return this.context.stores.map(store => this.baseUrl(store));
    }

    public testOrderSecret(): string | undefined {
        return setting(this.variables, 'E2E_TEST_ORDER_SECRET');
    }

    public testOrderReach(): OrderReach {
        return this.definition.paysTestOrders === true && !this.targetsProduction() ? 'success-page' : 'payment-window';
    }

    public variable(name: string): string | undefined {
        return setting(this.variables, name);
    }

    /**
     * The domains of the live shop: each store's host in every environment marked production, without
     * a leading `www.`. They come from the environments' own resolvers, never from an
     * `E2E_BASE_URL_<CODE>` override — an override points a run somewhere, it does not redefine what
     * the live shop is.
     */
    private productionDomains(): ReadonlySet<string> {
        this.productionDomainsOnce ??= new Set(
            Object.values(this.context.environments)
                .filter(definition => definition.production === true)
                .flatMap(definition => this.context.stores.map(store => definition.baseUrl(store, this.variables)))
                .map(hostWithoutWww),
        );

        return this.productionDomainsOnce;
    }
}

/**
 * Whether the search service is part of this run (`E2E_SEARCH_SERVICE`, `on` by default). Only an
 * environment that declares it optional accepts `off`: anywhere else the switch would hide a broken
 * search.
 */
function searchServiceSwitch(
    name: EnvironmentName,
    context: EnvironmentContext,
    variables: EnvironmentVariables,
): boolean {
    const on = switchSetting(variables, 'E2E_SEARCH_SERVICE', true);
    const optional = Object.entries(context.environments)
        .filter(([, definition]) => definition.searchServiceOptional === true)
        .map(([environment]) => environment);

    if (!on && !optional.includes(name)) {
        const accepted = optional.length === 0 ? 'none of this project\'s environments' : optional.join(', ');

        throw new Error(
            `E2E_SEARCH_SERVICE=off is not accepted on ${name}: there the search service is part of what `
            + `the run checks. It is accepted on ${accepted}.`,
        );
    }

    return on;
}

/** Whether a setting holds an address a browser can open; `localhost:8080` parses, with `localhost:` as its scheme. */
function isHttpAddress(value: string): boolean {
    return /^https?:\/\//i.test(value) && URL.canParse(value);
}

/** The host of a URL without a leading `www.`: both names are the same shop. */
function hostWithoutWww(url: string): string {
    return new URL(url).hostname.replace(/^www\./, '');
}

function withTrailingSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
}
