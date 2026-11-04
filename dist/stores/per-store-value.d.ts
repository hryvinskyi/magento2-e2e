import type { EnvironmentVariables } from '../environment/variables';
import type { StoreCode } from '../project/stores';
/**
 * A value recorded per store — a category path, a product's URL key — that a run may replace for one
 * store with `E2E_<NAME>_<STORE CODE>` (`E2E_OFFERS_PATH_MAIN`): a copy of the shop without the
 * production URL rewrites answers some pages only under another path.
 *
 * A store with neither a recorded value nor a setting is refused, naming the table to add it to, so
 * a test never runs against a page nobody chose.
 */
export declare function perStoreValue(name: string, values: Readonly<Partial<Record<StoreCode, string>>>): (code: StoreCode, variables?: EnvironmentVariables) => string;
