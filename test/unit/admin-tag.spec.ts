import { expect, test } from '@playwright/test';
import type { EnvironmentDefinition } from '../../src/environment/environment';
import type { ProjectConfig } from '../../src/project/project';
import { defineProject } from '../../src/project/project';
import { ADMIN_TAG, adminSafetyRule, requireAdminTag } from '../../src/safety/admin-tag';
import { TEST_ORDER_TAG, testOrderSafetyRule } from '../../src/safety/safety-tags';
import { sampleConfig } from './sample-project';

const CREDENTIALS = { E2E_ADMIN_USER: 'tester', E2E_ADMIN_PASSWORD: 'secret' };

const withAdmin = (definition: EnvironmentDefinition, adminUrl = 'https://shop.test/backoffice'): EnvironmentDefinition => ({
    ...definition,
    adminUrl: () => adminUrl,
});

/** The sample project's three environments. */
function sampleEnvironments(): { readonly local: EnvironmentDefinition; readonly staging: EnvironmentDefinition; readonly production: EnvironmentDefinition } {
    const { local, staging, production } = sampleConfig().environments;

    if (local === undefined || staging === undefined || production === undefined) {
        throw new Error('The sample project lost an environment.');
    }

    return { local, staging, production };
}

/** The sample project's environments, with an admin on the local copy and the staging server. */
function adminEnvironments(): Readonly<Record<string, EnvironmentDefinition>> {
    const { local, staging, production } = sampleEnvironments();

    return { local: withAdmin(local), staging: withAdmin(staging, 'https://staging.shop.test/backoffice/'), production };
}

/** The sample project with an admin on its local copy and its staging server. */
function adminConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
    return sampleConfig({ admin: {}, environments: adminEnvironments(), ...overrides });
}

test.describe('the @admin tag', () => {
    test('comes with admin in the definition, after the project\'s own tags', () => {
        expect(ADMIN_TAG).toBe('@admin');
        expect(defineProject(adminConfig({ safetyTags: { [TEST_ORDER_TAG]: testOrderSafetyRule } })).safetyTags())
            .toEqual(['@readonly', '@cart', '@mutating', '@order', '@admin']);
        expect(defineProject(sampleConfig()).safetyTags()).not.toContain(ADMIN_TAG);
    });

    test('runs where the environment has an admin and the run has its user', () => {
        expect(defineProject(adminConfig()).environment(CREDENTIALS).refusal([ADMIN_TAG])).toBeUndefined();
    });

    test('is refused where the environment says nowhere where the admin is', () => {
        const environments = { ...adminEnvironments(), local: sampleEnvironments().local };
        const local = defineProject(adminConfig({ environments })).environment(CREDENTIALS);

        expect(local.refusal([ADMIN_TAG])).toBe('@admin tests need the admin\'s address on local: its definition has no adminUrl');
    });

    test('is refused without a user or without a password', () => {
        const project = defineProject(adminConfig());
        const refusal = '@admin tests run only with E2E_ADMIN_USER and E2E_ADMIN_PASSWORD set';

        expect(project.environment({}).refusal([ADMIN_TAG])).toBe(refusal);
        expect(project.environment({ E2E_ADMIN_USER: 'tester' }).refusal([ADMIN_TAG])).toBe(refusal);
        expect(project.environment({ E2E_ADMIN_USER: 'tester', E2E_ADMIN_PASSWORD: '' }).refusal([ADMIN_TAG])).toBe(refusal);
        expect(project.environment({ E2E_ADMIN_USER: ' ', E2E_ADMIN_PASSWORD: 'secret' }).refusal([ADMIN_TAG])).toBe(refusal);
    });

    test('never runs against the live shop unless the project says onProduction', () => {
        const pointedAtTheLiveShop = { ...CREDENTIALS, E2E_BASE_URL_MAIN: 'https://www.example.com/' };

        expect(defineProject(adminConfig()).environment(pointedAtTheLiveShop).refusal([ADMIN_TAG]))
            .toBe('@admin tests never run against the live shop');
        expect(defineProject(adminConfig({ admin: { onProduction: true } })).environment(pointedAtTheLiveShop).refusal([ADMIN_TAG]))
            .toBeUndefined();
    });

    test('runs on the production environment when the project says onProduction and that environment has an admin', () => {
        const config = adminConfig({
            admin: { onProduction: true },
            environments: { ...adminEnvironments(), production: withAdmin(sampleEnvironments().production, 'https://www.example.com/backoffice/') },
        });

        expect(defineProject(config).environment({ ...CREDENTIALS, E2E_ENV: 'production' }).refusal([ADMIN_TAG])).toBeUndefined();
    });

    test('its rule says onProduction only when the settings do', () => {
        expect(adminSafetyRule({}).onProduction).toBe(false);
        expect(adminSafetyRule({ onProduction: false }).onProduction).toBe(false);
        expect(adminSafetyRule({ onProduction: true }).onProduction).toBe(true);
    });
});

test.describe('the admin fixture', () => {
    const tags = ['@readonly', '@cart', '@mutating', ADMIN_TAG];

    test('is for a test tagged @admin', () => {
        expect(() => { requireAdminTag(tags, [ADMIN_TAG], 'edits a page'); }).not.toThrow();
        expect(() => { requireAdminTag(tags, ['@readonly'], 'edits a page'); })
            .toThrow('The admin fixture is for tests tagged @admin; "edits a page" is not.');
    });

    test('needs admin in the project definition', () => {
        expect(() => { requireAdminTag(['@readonly'], ['@readonly', ADMIN_TAG], 'edits a page'); })
            .toThrow('The admin fixture needs admin in the project definition; "edits a page" runs in a project without it.');
    });
});

test.describe('defineProject refuses an admin that contradicts itself', () => {
    test('an admin no environment says where to find', () => {
        expect(() => defineProject(sampleConfig({ admin: {} })))
            .toThrow('admin is declared, but no environment says where the admin is (adminUrl)');
    });

    test('an admin address in a project without an admin', () => {
        expect(() => defineProject(sampleConfig({ environments: adminEnvironments() })))
            .toThrow('environment "local" has an adminUrl, but the project declares no admin; environment "staging" has an adminUrl');
    });

    test('the live shop\'s admin address where @admin may not run on production', () => {
        const environments = { ...adminEnvironments(), production: withAdmin(sampleEnvironments().production, 'https://www.example.com/backoffice/') };

        expect(() => defineProject(adminConfig({ environments })))
            .toThrow('environment "production" is production and has an adminUrl, but @admin tests run there only with admin.onProduction set');
        expect(() => defineProject(adminConfig({ environments, admin: { onProduction: true } }))).not.toThrow();
    });

    test('@admin among the project\'s own safety tags', () => {
        expect(() => defineProject(adminConfig({ safetyTags: { [ADMIN_TAG]: { onProduction: true } } })))
            .toThrow('the safety tag "@admin" comes with admin in the project definition and cannot be defined in safetyTags');
    });
});

test.describe('the admin of an environment', () => {
    test('is at the address its definition gives, with a trailing slash', () => {
        const project = defineProject(adminConfig());

        expect(project.environment({}).adminUrl()).toBe('https://shop.test/backoffice/');
        expect(project.environment({ E2E_ENV: 'staging' }).adminUrl()).toBe('https://staging.shop.test/backoffice/');
        expect(project.environment({ E2E_ENV: 'production' }).adminUrl()).toBeUndefined();
    });

    test('reads the run\'s variables', () => {
        const environments = {
            ...adminEnvironments(),
            local: { ...sampleEnvironments().local, adminUrl: (variables: Readonly<Record<string, string | undefined>>) => `https://${variables.E2E_ADMIN_HOST ?? 'admin.test'}/` },
        };

        expect(defineProject(adminConfig({ environments })).environment({ E2E_ADMIN_HOST: 'other.test' }).adminUrl()).toBe('https://other.test/');
    });

    test('refuses an address that is not an absolute http(s) URL', () => {
        const environments = { ...adminEnvironments(), local: withAdmin(sampleEnvironments().local, 'shop.test/backoffice') };

        expect(() => defineProject(adminConfig({ environments })).environment({}).adminUrl())
            .toThrow('The admin of local must be at an absolute http(s) URL; adminUrl gave "shop.test/backoffice".');
    });

    test('is signed in to as the run\'s user, the name trimmed and the password as given', () => {
        const environment = defineProject(adminConfig()).environment({ E2E_ADMIN_USER: ' tester ', E2E_ADMIN_PASSWORD: ' pass ' });

        expect(environment.adminCredentials()).toEqual({ username: 'tester', password: ' pass ' });
        expect(defineProject(adminConfig()).environment({}).adminCredentials()).toBeUndefined();
    });
});
