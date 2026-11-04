import path from 'node:path';
import { consentCookie, defineProject, sessionStorageFlag } from '@hryvinskyi/magento2-e2e';
import type { EnvironmentDefinition, EnvironmentVariables, MagentoProject, Store as BaseStore } from '@hryvinskyi/magento2-e2e';

/** Which host a store is served from; each environment says what that host is there. */
export type HostLabel = 'shop';

/** A store of this project: the package's store, plus the host it is served from. */
export interface Store extends BaseStore {
    readonly hostLabel: HostLabel;
}

export const STORES: { readonly main: Store; readonly second: Store } = {
    main: { code: 'main', path: '/', locale: 'en-GB', hostLabel: 'shop' },
    second: { code: 'second', path: '/second/', locale: 'fr-FR', hostLabel: 'shop' },
};

/** The flag the page guard presets, and the cookie the consent policy records; the specs read both. */
export const OVERLAY_FLAG = 'overlay-answered';
export const CONSENT_COOKIE = 'visitor-consent';

/** Requests no test may ever send; the page server logs any that arrive. */
export const BLOCKED_PATH = '/blocked-beacon';

/** The page server's address: one server, two names, so the environments have different origins. */
function serverUrl(hosts: Readonly<Record<HostLabel, string>>): EnvironmentDefinition['baseUrl'] {
    return (store, variables) => `http://${hosts[store.hostLabel]}:${portOf(variables)}${store.path}`;
}

function portOf(variables: EnvironmentVariables): string {
    const port = variables.E2E_CONSUMER_PORT?.trim();

    if (port === undefined || port === '') {
        throw new Error('E2E_CONSUMER_PORT must name the port of the page server.');
    }

    return port;
}

export const ENVIRONMENTS: {
    readonly local: EnvironmentDefinition;
    readonly production: EnvironmentDefinition;
} = {
    local: { baseUrl: serverUrl({ shop: 'localhost' }), searchServiceOptional: true },
    production: { baseUrl: serverUrl({ shop: '127.0.0.1' }), production: true },
};

declare module '@hryvinskyi/magento2-e2e' {
    interface Register {
        stores: typeof STORES;
        environments: typeof ENVIRONMENTS;
    }
}

export const project: MagentoProject = defineProject({
    name: 'Consumer',
    magentoRoot: path.join(__dirname, 'magento'),
    stores: STORES,
    defaultStore: 'main',
    environments: ENVIRONMENTS,
    defaultEnvironment: 'local',
    consent: consentCookie(CONSENT_COOKIE, 'granted'),
    pageGuards: [sessionStorageFlag(OVERLAY_FLAG, 'yes')],
    blockedRequests: [new RegExp(`${BLOCKED_PATH}(?:[/?]|$)`)],
    productionWriteGuard: {},
});
