/**
 * A Magento store view as the tests address it.
 */
export interface Store {
    /** The Magento store code; also the key the store is listed under in the project's stores. */
    readonly code: string;
    /** The store view's path below its host, with a leading and a trailing slash: `/`, `/fr/`. */
    readonly path: string;
    /** The browser locale the store is tested with, e.g. `en-GB`. */
    readonly locale: string;
}

/**
 * The point a project narrows the package's types at. It is empty here; a project declares it once:
 *
 * ```ts
 * declare module '@hryvinskyi/magento2-e2e' {
 *     interface Register {
 *         stores: typeof STORES;
 *         environments: typeof ENVIRONMENTS;
 *     }
 * }
 * ```
 *
 * From then on `StoreCode`, `RegisteredStore` and `EnvironmentName` are that project's own store codes,
 * stores and environment names everywhere the package uses them. Without it they are `string`, `Store`
 * and `string`.
 */
export interface Register {}

/** Any map of stores keyed by store code: what `StoreMap` is while no project declares its own. */
type AnyStoreMap = Readonly<Record<string, Store>>;

/**
 * The project's stores, keyed by store code: `Register['stores']` once a project declares it — `never`
 * when the declared value is not a map of stores — and any map of stores otherwise.
 */
export type StoreMap = Register extends { readonly stores: infer Declared }
    ? Declared extends AnyStoreMap ? Declared : never
    : AnyStoreMap;

/** A store code of the project. */
export type StoreCode = Extract<keyof StoreMap, string>;

/** A store of the project, as the project declares it. */
export type RegisteredStore = StoreMap[StoreCode];

/** The name of one of the project's environments. */
export type EnvironmentName = Register extends { readonly environments: infer Declared }
    ? Extract<keyof Declared, string>
    : string;
