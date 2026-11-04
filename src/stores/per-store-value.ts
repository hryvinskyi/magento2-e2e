import type { EnvironmentVariables } from '../environment/variables';
import { setting, storeSettingName } from '../environment/variables';
import type { StoreCode } from '../project/stores';

/**
 * A value recorded per store — a category path, a product's URL key — that a run may replace for one
 * store with `E2E_<NAME>_<STORE CODE>` (`E2E_OFFERS_PATH_MAIN`): a copy of the shop without the
 * production URL rewrites answers some pages only under another path.
 *
 * A store with neither a recorded value nor a setting is refused, naming the table to add it to, so
 * a test never runs against a page nobody chose.
 */
export function perStoreValue(
    name: string,
    values: Readonly<Partial<Record<StoreCode, string>>>,
): (code: StoreCode, variables?: EnvironmentVariables) => string {
    const recorded: Readonly<Partial<Record<StoreCode, string>>> = Object.freeze({ ...values });

    return (code: StoreCode, variables: EnvironmentVariables = process.env): string => {
        const value = setting(variables, storeSettingName(name, code)) ?? recorded[code];

        if (value === undefined || value === '') {
            throw new Error(`No value is recorded for store "${code}" in ${name} — add it there.`);
        }

        return value;
    };
}
