import type { Environment } from '../environment/environment';
import type { SafetyTagRule } from './safety-tags';

/** Carried by a test that signs in to the shop's admin; a project that declares `admin` has it. */
export const ADMIN_TAG = '@admin';

/** What a project says about its admin; `admin: {}` in `defineProject` gives a project the `@admin` tag. */
export interface AdminSettings {
    /**
     * Whether `@admin` tests may run on a run that targets the live shop. Default false: the admin of the
     * live shop holds its real customers, orders and configuration.
     */
    readonly onProduction?: boolean;
}

/**
 * The rule of `@admin`, as `defineProject` registers it for a project that declares `admin`. A test is
 * refused where the environment says nowhere where the admin is, and where the run has no admin user; on
 * a run that targets the live shop it runs only when the project said `onProduction`.
 */
export function adminSafetyRule(settings: AdminSettings): SafetyTagRule {
    return {
        onProduction: settings.onProduction === true,
        refusal: (environment: Environment) => {
            if (environment.adminUrl() === undefined) {
                return `${ADMIN_TAG} tests need the admin's address on ${environment.name}: its definition has no adminUrl`;
            }

            return environment.adminCredentials() === undefined
                ? `${ADMIN_TAG} tests run only with E2E_ADMIN_USER and E2E_ADMIN_PASSWORD set`
                : undefined;
        },
    };
}

/**
 * Refuses a test that may not work in the admin, naming it by its `title`: one without the tag, and one
 * in a project that declares no admin. The tag's rule decides where the admin is reached, so a test
 * outside it must not sign in at all.
 */
export function requireAdminTag(safetyTags: readonly string[], testTags: readonly string[], title: string): void {
    if (!testTags.includes(ADMIN_TAG)) {
        throw new Error(`The admin fixture is for tests tagged ${ADMIN_TAG}; "${title}" is not.`);
    }

    if (!safetyTags.includes(ADMIN_TAG)) {
        throw new Error(`The admin fixture needs admin in the project definition; "${title}" runs in a project without it.`);
    }
}
