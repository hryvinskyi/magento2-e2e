"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineProject = defineProject;
exports.isMagentoProject = isMagentoProject;
const environment_1 = require("../environment/environment");
const admin_tag_1 = require("../safety/admin-tag");
const safety_tags_1 = require("../safety/safety-tags");
const placement_1 = require("../test-orders/placement");
const own_entry_1 = require("./own-entry");
const project_validation_1 = require("./project-validation");
/**
 * Marks the objects `defineProject` made. It is private to this module and set as a non-enumerable
 * property, so neither other code nor a spread copy of a project carries it.
 */
const PROJECT_BRAND = Symbol('MagentoProject');
/**
 * Checks a project definition and returns it frozen. A definition that contradicts itself — a
 * default store that is not one of the stores, a production environment that skips certificate
 * checks — is refused with every problem named.
 */
function defineProject(config) {
    const problems = (0, project_validation_1.projectProblems)(config);
    if (problems.length > 0) {
        throw new Error(`The project "${config.name}" is not valid: ${problems.join('; ')}.`);
    }
    const storeMap = Object.freeze({ ...config.stores });
    const stores = Object.freeze(Object.values(storeMap));
    const safetyTags = new safety_tags_1.SafetyTagRegistry({
        ...config.safetyTags,
        ...(config.admin === undefined ? {} : { [admin_tag_1.ADMIN_TAG]: (0, admin_tag_1.adminSafetyRule)(config.admin) }),
    });
    const tags = Object.freeze(safetyTags.tags());
    const context = Object.freeze({
        stores,
        environments: Object.freeze({ ...config.environments }),
        defaultEnvironment: config.defaultEnvironment,
        safetyTags,
        userAgentSuffix: config.userAgentSuffix,
        productionWriteGuard: config.productionWriteGuard,
    });
    const project = {
        name: config.name,
        magentoRoot: config.magentoRoot,
        defaultStore: config.defaultStore,
        pageGuards: Object.freeze([...(config.pageGuards ?? [])]),
        blockedRequests: Object.freeze([...(config.blockedRequests ?? [])]),
        storefrontBehaviour: storefrontBehaviourOf(config),
        blockServiceWorkers: config.blockServiceWorkers ?? false,
        testOrderPlacements: Object.freeze([...(config.testOrderPlacements ?? [placement_1.GUEST_PAYMENT_INFORMATION])]),
        shopClient: config.shopClient ?? 'runner',
        environment(variables = process.env) {
            return (0, environment_1.createEnvironment)(context, variables);
        },
        store(code) {
            const entry = (0, own_entry_1.ownEntry)(storeMap, code);
            if (entry === undefined) {
                throw new Error(`Unknown store "${code}"; the project's stores are ${Object.keys(storeMap).join(', ')}.`);
            }
            return entry.value;
        },
        stores() {
            return stores;
        },
        safetyTags() {
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
function isMagentoProject(value) {
    return typeof value === 'object' && value !== null && Object.hasOwn(value, PROJECT_BRAND);
}
function storefrontBehaviourOf(config) {
    const { consent, deferredAssets } = config;
    return Object.freeze({
        ...(consent === undefined ? {} : { consent }),
        ...(deferredAssets === undefined ? {} : { deferredAssets }),
    });
}
