"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectProblems = projectProblems;
const node_path_1 = require("node:path");
const safety_tags_1 = require("../safety/safety-tags");
/**
 * Every way a project definition contradicts itself or the package's rules, one sentence each;
 * nothing when it is valid.
 */
function projectProblems(config) {
    return [
        ...magentoRootProblems(config),
        ...storeProblems(config),
        ...environmentProblems(config),
        ...safetyTagProblems(config),
    ];
}
function magentoRootProblems(config) {
    return (0, node_path_1.isAbsolute)(config.magentoRoot)
        ? []
        : [`magentoRoot must be an absolute path; got "${config.magentoRoot}"`];
}
function storeProblems(config) {
    const codes = Object.keys(config.stores);
    const problems = Object.entries(config.stores).flatMap(([key, store]) => [
        ...(store.code === key
            ? []
            : [`store "${key}" declares the code "${store.code}"; a store's code is the key it is listed under`]),
        ...(store.path.startsWith('/') && store.path.endsWith('/')
            ? []
            : [`store "${key}" has the path "${store.path}"; a store path starts and ends with "/"`]),
    ]);
    return codes.includes(config.defaultStore)
        ? problems
        : [`defaultStore "${config.defaultStore}" is not one of the stores (${codes.join(', ')})`, ...problems];
}
function environmentProblems(config) {
    const names = Object.keys(config.environments);
    const problems = Object.entries(config.environments)
        .filter(([, definition]) => definition.production === true)
        .flatMap(([name, definition]) => [
        ...(definition.ignoreHttpsErrors === true
            ? [`environment "${name}" is production and sets ignoreHttpsErrors: the live shop's certificate is always checked`]
            : []),
        ...(definition.searchServiceOptional === true
            ? [`environment "${name}" is production and sets searchServiceOptional: the live shop's search is always checked`]
            : []),
    ]);
    return names.includes(config.defaultEnvironment)
        ? problems
        : [
            `defaultEnvironment "${config.defaultEnvironment}" is not one of the environments (${names.join(', ')})`,
            ...problems,
        ];
}
function safetyTagProblems(config) {
    return Object.keys(config.safetyTags ?? {}).flatMap(tag => [
        ...(tag.startsWith('@') ? [] : [`the safety tag "${tag}" must start with "@"`]),
        ...((0, safety_tags_1.isCoreSafetyTag)(tag) ? [`the safety tag "${tag}" is a core tag and cannot be redefined`] : []),
    ]);
}
