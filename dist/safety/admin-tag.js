"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_TAG = void 0;
exports.adminSafetyRule = adminSafetyRule;
exports.requireAdminTag = requireAdminTag;
/** Carried by a test that signs in to the shop's admin; a project that declares `admin` has it. */
exports.ADMIN_TAG = '@admin';
/**
 * The rule of `@admin`, as `defineProject` registers it for a project that declares `admin`. A test is
 * refused where the environment says nowhere where the admin is, and where the run has no admin user; on
 * a run that targets the live shop it runs only when the project said `onProduction`.
 */
function adminSafetyRule(settings) {
    return {
        onProduction: settings.onProduction === true,
        refusal: (environment) => {
            if (environment.adminUrl() === undefined) {
                return `${exports.ADMIN_TAG} tests need the admin's address on ${environment.name}: its definition has no adminUrl`;
            }
            return environment.adminCredentials() === undefined
                ? `${exports.ADMIN_TAG} tests run only with E2E_ADMIN_USER and E2E_ADMIN_PASSWORD set`
                : undefined;
        },
    };
}
/**
 * Refuses a test that may not work in the admin, naming it by its `title`: one without the tag, and one
 * in a project that declares no admin. The tag's rule decides where the admin is reached, so a test
 * outside it must not sign in at all.
 */
function requireAdminTag(safetyTags, testTags, title) {
    if (!testTags.includes(exports.ADMIN_TAG)) {
        throw new Error(`The admin fixture is for tests tagged ${exports.ADMIN_TAG}; "${title}" is not.`);
    }
    if (!safetyTags.includes(exports.ADMIN_TAG)) {
        throw new Error(`The admin fixture needs admin in the project definition; "${title}" runs in a project without it.`);
    }
}
