import type { EnvironmentName, RegisteredStore, StoreCode } from '@hryvinskyi/magento2-e2e';
import type { HostLabel, Store } from './project';

/**
 * `true` exactly when each type is assignable to the other. The package's fallbacks fail it: `string`
 * is wider than a union of names, and the package's `Store` lacks this project's own field.
 */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * What the project's declaration of its stores and environments does to the package's types: each
 * constant compiles only while its comparison resolves to `true`.
 */
const storeCodes: Equal<StoreCode, 'main' | 'second'> = true;
const environmentNames: Equal<EnvironmentName, 'local' | 'production'> = true;
const registeredStore: Equal<RegisteredStore, Store> = true;

/** A field only this project's stores have, read through the package's store type. */
const hostLabelOf = (store: RegisteredStore): HostLabel => store.hostLabel;

export const proofs: readonly [true, true, true] = [storeCodes, environmentNames, registeredStore];
export const readsHostLabel: (store: RegisteredStore) => HostLabel = hostLabelOf;
