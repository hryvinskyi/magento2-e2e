import { isAbsolute } from 'node:path';
import { isCoreSafetyTag } from '../safety/safety-tags';
import { isRecord } from '../test-orders/answers';
import { SHOP_CLIENTS } from '../test-orders/shop';
import type { ProjectConfig } from './project';

/**
 * Every way a project definition contradicts itself or the package's rules, one sentence each;
 * nothing when it is valid.
 */
export function projectProblems(config: ProjectConfig): readonly string[] {
    return [
        ...magentoRootProblems(config),
        ...storeProblems(config),
        ...environmentProblems(config),
        ...safetyTagProblems(config),
        ...testOrderPlacementProblems(config),
        ...shopClientProblems(config),
    ];
}

function magentoRootProblems(config: ProjectConfig): readonly string[] {
    return isAbsolute(config.magentoRoot)
        ? []
        : [`magentoRoot must be an absolute path; got "${config.magentoRoot}"`];
}

function storeProblems(config: ProjectConfig): readonly string[] {
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

function environmentProblems(config: ProjectConfig): readonly string[] {
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

function safetyTagProblems(config: ProjectConfig): readonly string[] {
    return Object.keys(config.safetyTags ?? {}).flatMap(tag => [
        ...(tag.startsWith('@') ? [] : [`the safety tag "${tag}" must start with "@"`]),
        ...(isCoreSafetyTag(tag) ? [`the safety tag "${tag}" is a core tag and cannot be redefined`] : []),
    ]);
}

function testOrderPlacementProblems({ testOrderPlacements }: ProjectConfig): readonly string[] {
    if (testOrderPlacements === undefined) {
        return [];
    }

    return testOrderPlacements.length === 0
        ? ['testOrderPlacements names no placement route; leave it out for Magento\'s own checkout']
        : testOrderPlacements.flatMap(missingRouteMembers);
}

/** A client no one sends through, read as a value: a plain JavaScript project gets past the types. */
function shopClientProblems({ shopClient }: ProjectConfig): readonly string[] {
    const known: readonly unknown[] = SHOP_CLIENTS;

    return shopClient === undefined || known.includes(shopClient)
        ? []
        : [`shopClient must be one of ${SHOP_CLIENTS.join(', ')}; got "${shopClient}"`];
}

/** What a declared route lacks, read as a value: a plain JavaScript project gets past the types. */
function missingRouteMembers(route: unknown, index: number): readonly string[] {
    const members = isRecord(route) ? route : {};
    const missing = [
        ...(members.stopped instanceof RegExp ? [] : ['stopped (a RegExp)']),
        ...(typeof members.cartOf === 'function' ? [] : ['cartOf (a function)']),
        ...(typeof members.outcomeOf === 'function' ? [] : ['outcomeOf (a function)']),
    ];

    return missing.length === 0 ? [] : [`testOrderPlacements[${String(index)}] has no ${missing.join(', ')}`];
}
