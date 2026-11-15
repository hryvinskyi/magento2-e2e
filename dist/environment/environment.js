"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnvironment = createEnvironment;
const own_entry_1 = require("../project/own-entry");
const variables_1 = require("./variables");
/**
 * The environment `E2E_ENV` names, or the project's default one when it is unset. An unknown name is
 * refused with the known ones, so a typing mistake never runs against an environment nobody chose.
 */
function createEnvironment(context, variables) {
    const name = (0, variables_1.setting)(variables, 'E2E_ENV') ?? context.defaultEnvironment;
    const entry = (0, own_entry_1.ownEntry)(context.environments, name);
    if (entry === undefined) {
        throw new Error(`E2E_ENV must be one of ${Object.keys(context.environments).join(', ')}; got "${name}".`);
    }
    return new RunEnvironment(entry.key, entry.value, context, variables);
}
class RunEnvironment {
    name;
    isProduction;
    hasSearchService;
    ignoresHttpsErrors;
    workers;
    definition;
    context;
    variables;
    productionDomainsOnce;
    constructor(name, definition, context, variables) {
        this.name = name;
        this.definition = definition;
        this.context = context;
        this.variables = variables;
        this.isProduction = definition.production === true;
        this.ignoresHttpsErrors = definition.ignoreHttpsErrors === true;
        this.workers = definition.workers;
        this.hasSearchService = searchServiceSwitch(name, context, variables);
    }
    baseUrl(store) {
        const name = (0, variables_1.storeSettingName)('BASE_URL', store.code);
        const override = (0, variables_1.setting)(this.variables, name);
        if (override !== undefined && !isHttpAddress(override)) {
            throw new Error(`${name} must be an absolute http(s) URL; got "${override}".`);
        }
        return withTrailingSlash(override ?? this.definition.baseUrl(store, this.variables));
    }
    allows(tags) {
        return this.refusal(tags) === undefined;
    }
    refusal(tags) {
        return this.context.safetyTags.refusal(tags, this);
    }
    httpCredentials() {
        const username = (0, variables_1.setting)(this.variables, 'E2E_HTTP_USER');
        return username === undefined
            ? undefined
            : { username, password: this.variables.E2E_HTTP_PASSWORD ?? '' };
    }
    userAgentSuffix() {
        return (0, variables_1.setting)(this.variables, 'E2E_USER_AGENT_SUFFIX') ?? this.context.userAgentSuffix?.trim() ?? '';
    }
    isProductionOrigin(url) {
        const host = hostWithoutWww(url);
        return [...this.productionDomains()].some(domain => host === domain || host.endsWith(`.${domain}`));
    }
    targetsProduction() {
        return this.isProduction
            || this.context.stores.some(store => this.productionDomains().has(hostWithoutWww(this.baseUrl(store))));
    }
    guardsWrites() {
        return this.context.productionWriteGuard !== undefined && this.targetsProduction();
    }
    shopOrigins() {
        const allowed = this.context.productionWriteGuard?.allowedOrigins ?? [];
        return new Set([
            ...this.context.stores.map(store => new URL(this.baseUrl(store)).origin),
            ...allowed.map(origin => new URL(origin).origin),
        ]);
    }
    storeBaseUrls() {
        return this.context.stores.map(store => this.baseUrl(store));
    }
    testOrderSecret() {
        return (0, variables_1.setting)(this.variables, 'E2E_TEST_ORDER_SECRET');
    }
    testOrderReach() {
        return this.definition.paysTestOrders === true && !this.targetsProduction() ? 'success-page' : 'payment-window';
    }
    variable(name) {
        return (0, variables_1.setting)(this.variables, name);
    }
    adminUrl() {
        const resolve = this.definition.adminUrl;
        if (resolve === undefined) {
            return undefined;
        }
        const address = resolve(this.variables);
        if (!isHttpAddress(address)) {
            throw new Error(`The admin of ${this.name} must be at an absolute http(s) URL; adminUrl gave "${address}".`);
        }
        return withTrailingSlash(address);
    }
    adminCredentials() {
        const username = (0, variables_1.setting)(this.variables, 'E2E_ADMIN_USER');
        const password = this.variables.E2E_ADMIN_PASSWORD;
        return username === undefined || password === undefined || password === ''
            ? undefined
            : { username, password };
    }
    /**
     * The domains of the live shop: each store's host in every environment marked production, without
     * a leading `www.`. They come from the environments' own resolvers, never from an
     * `E2E_BASE_URL_<CODE>` override — an override points a run somewhere, it does not redefine what
     * the live shop is.
     */
    productionDomains() {
        this.productionDomainsOnce ??= new Set(Object.values(this.context.environments)
            .filter(definition => definition.production === true)
            .flatMap(definition => this.context.stores.map(store => definition.baseUrl(store, this.variables)))
            .map(hostWithoutWww));
        return this.productionDomainsOnce;
    }
}
/**
 * Whether the search service is part of this run (`E2E_SEARCH_SERVICE`, `on` by default). Only an
 * environment that declares it optional accepts `off`: anywhere else the switch would hide a broken
 * search.
 */
function searchServiceSwitch(name, context, variables) {
    const on = (0, variables_1.switchSetting)(variables, 'E2E_SEARCH_SERVICE', true);
    const optional = Object.entries(context.environments)
        .filter(([, definition]) => definition.searchServiceOptional === true)
        .map(([environment]) => environment);
    if (!on && !optional.includes(name)) {
        const accepted = optional.length === 0 ? 'none of this project\'s environments' : optional.join(', ');
        throw new Error(`E2E_SEARCH_SERVICE=off is not accepted on ${name}: there the search service is part of what `
            + `the run checks. It is accepted on ${accepted}.`);
    }
    return on;
}
/** Whether a setting holds an address a browser can open; `localhost:8080` parses, with `localhost:` as its scheme. */
function isHttpAddress(value) {
    return /^https?:\/\//i.test(value) && URL.canParse(value);
}
/** The host of a URL without a leading `www.`: both names are the same shop. */
function hostWithoutWww(url) {
    return new URL(url).hostname.replace(/^www\./, '');
}
function withTrailingSlash(url) {
    return url.endsWith('/') ? url : `${url}/`;
}
