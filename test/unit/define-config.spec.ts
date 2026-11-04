import fs from 'node:fs';
import path from 'node:path';
import { devices, expect, test } from '@playwright/test';
import type { ConfigInputs, MagentoConfigOptions } from '../../src/config/define-config';
import { defineMagentoConfig, magentoConfig } from '../../src/config/define-config';
import type { EnvironmentVariables } from '../../src/environment/variables';
import type { ModuleTests } from '../../src/modules/module-tests';
import type { ProjectConfig } from '../../src/project/project';
import { defineProject } from '../../src/project/project';
import { sampleConfig } from './sample-project';
import { temporaryDirectory } from './temporary-files';

const CONFIG_DIR = path.join(path.sep, 'srv', 'acme', 'e2e');

const MODULES: readonly ModuleTests[] = [
    { module: 'Acme_One', dir: '/srv/acme/app/code/Acme/One/Test/E2e', source: 'app/code' },
    { module: 'Acme_Two', dir: '/srv/acme/vendor/acme/module-two/Test/E2e', source: 'vendor' },
];

function options(overrides: Partial<MagentoConfigOptions> = {}, project: Partial<ProjectConfig> = {}): MagentoConfigOptions {
    return { project: defineProject(sampleConfig(project)), configDir: CONFIG_DIR, ...overrides };
}

function inputs(variables: EnvironmentVariables = {}, modules: readonly ModuleTests[] = MODULES): ConfigInputs {
    return { variables, modules, preflightModule: '/package/preflight.js', sharedReporter: '/package/shared-reporter.js' };
}

test('one project per browser and suite, named after both', () => {
    const config = magentoConfig(options(), inputs());

    expect(config.projects?.map(project => project.name)).toEqual([
        'desktop', 'desktop-modules', 'desktop-packages', 'mobile', 'mobile-modules', 'mobile-packages',
    ]);
    expect(config.projects?.[1]).toMatchObject({
        testDir: '/srv/acme/app/code',
        testMatch: ['/srv/acme/app/code/Acme/One/Test/E2e/**/*.spec.ts'],
        grepInvert: /@mobile-only/,
    });
    expect(config.projects?.[4]).toMatchObject({ grep: /@mobile/ });
    expect(config.projects?.[4]).not.toHaveProperty('grepInvert');
});

test('every project uses its device, with the user agent the environment gives', () => {
    const projectSuffix = 'Label/1.0';
    const runSuffix = 'Other/2.0';
    const plain = magentoConfig(options(), inputs());
    const labelled = magentoConfig(options({}, { userAgentSuffix: projectSuffix }), inputs());
    const overridden = magentoConfig(
        options({}, { userAgentSuffix: projectSuffix }),
        inputs({ E2E_USER_AGENT_SUFFIX: runSuffix }),
    );

    expect(plain.projects?.[0]?.use).toEqual({ ...devices['Desktop Chrome'] });
    expect(labelled.projects?.[3]?.use)
        .toEqual({ ...devices['Pixel 7'], userAgent: `${devices['Pixel 7'].userAgent} ${projectSuffix}` });
    expect(overridden.projects?.[0]?.use?.userAgent).toBe(`${devices['Desktop Chrome'].userAgent} ${runSuffix}`);
});

test('the project and the default store reach every test through use', () => {
    const given = options();
    const config = magentoConfig(given, inputs());

    expect(config.use).toMatchObject({
        actionTimeout: 20_000,
        navigationTimeout: 60_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        ignoreHTTPSErrors: false,
        storeCode: 'main',
    });
    expect(config.use?.magentoProject).toBe(given.project);
    expect(config.use).not.toHaveProperty('httpCredentials');
});

test('the environment decides the certificate rule and the site login', () => {
    const environments = { local: { baseUrl: (): string => 'https://shop.test/', ignoreHttpsErrors: true } };
    const config = magentoConfig(
        options({}, { environments, defaultEnvironment: 'local' }),
        inputs({ E2E_HTTP_USER: 'tester', E2E_HTTP_PASSWORD: 'secret' }),
    );

    expect(config.use?.ignoreHTTPSErrors).toBe(true);
    expect(config.use?.httpCredentials).toEqual({ username: 'tester', password: 'secret' });
});

test('the run settings: files below the config directory, timeouts, the environment in the metadata', () => {
    const config = magentoConfig(options(), inputs({ E2E_ENV: 'staging' }));

    expect(config).toMatchObject({
        outputDir: path.join(CONFIG_DIR, 'test-results'),
        tsconfig: path.join(CONFIG_DIR, 'tsconfig.json'),
        fullyParallel: true,
        forbidOnly: false,
        retries: 0,
        timeout: 90_000,
        expect: { timeout: 15_000 },
        metadata: { environment: 'staging' },
        globalSetup: '/package/preflight.js',
    });
});

test('on CI only is a test.only refused and a failure retried', () => {
    expect(magentoConfig(options(), inputs({ CI: 'true' }))).toMatchObject({ forbidOnly: true, retries: 2 });
});

test('the workers: the environment\'s own number, else two, three on CI, two against production', () => {
    const local = { local: { baseUrl: (): string => 'https://shop.test/' } };
    const live = { live: { baseUrl: (): string => 'https://shop.example/', production: true } };

    expect(magentoConfig(options(), inputs({ E2E_ENV: 'production' })).workers).toBe(1);
    expect(magentoConfig(options({}, { environments: local }), inputs()).workers).toBe(2);
    expect(magentoConfig(options({}, { environments: local }), inputs({ CI: '1' })).workers).toBe(3);
    expect(magentoConfig(options({}, { environments: live, defaultEnvironment: 'live' }), inputs({ CI: '1' })).workers)
        .toBe(2);
});

test('a run pointed at the live shop gets the workers of a run against production', () => {
    const local = { local: { baseUrl: (): string => 'https://shop.test/' } };
    const live = { live: { baseUrl: (): string => 'https://www.example.com/', production: true } };
    const pointed = { CI: '1', E2E_BASE_URL_MAIN: 'https://example.com/' };

    expect(magentoConfig(options({}, { environments: { ...local, ...live } }), inputs(pointed)).workers).toBe(2);
    expect(magentoConfig(options({}, { environments: { ...local, ...live } }), inputs({ CI: '1' })).workers).toBe(3);
});

test('a run that keeps evidence records every test and adds the evidence reporters', () => {
    const config = magentoConfig(options(), inputs({ E2E_EVIDENCE: '1', E2E_COMMIT: 'abc', E2E_TRIGGER: 'nightly' }));

    expect(config.use).toMatchObject({ screenshot: 'on', video: 'on' });
    expect(config.reporter).toContainEqual(['/package/shared-reporter.js', expect.objectContaining({
        environmentInfo: { Environment: 'local', Commit: 'abc', Trigger: 'nightly' },
    })]);
});

test('the storefront check is skipped by the option or for one run by E2E_PREFLIGHT=off', () => {
    expect(magentoConfig(options({ preflight: false }), inputs())).not.toHaveProperty('globalSetup');
    expect(magentoConfig(options(), inputs({ E2E_PREFLIGHT: ' OFF ' }))).not.toHaveProperty('globalSetup');
    expect(magentoConfig(options(), inputs({ E2E_PREFLIGHT: 'on' })).globalSetup).toBe('/package/preflight.js');
    expect(() => magentoConfig(options(), inputs({ E2E_PREFLIGHT: 'skip' })))
        .toThrow('E2E_PREFLIGHT must be "on" or "off"; got "skip".');
});

test('E2E_WEBKIT adds Safari\'s engine over every suite; a project\'s own browsers replace the defaults', () => {
    const webkit = magentoConfig(options(), inputs({ E2E_WEBKIT: '1' }, []));
    const own = magentoConfig(options({ devices: [{ name: 'tablet', device: 'iPad Mini' }] }), inputs({ E2E_WEBKIT: '1' }, []));

    expect(webkit.projects?.map(project => project.name)).toEqual(['desktop', 'mobile', 'desktop-safari', 'iphone']);
    expect(own.projects?.map(project => project.name)).toEqual(['tablet']);
    expect(() => magentoConfig(options({ devices: [{ name: 'tv', device: 'Smart Fridge' }] }), inputs()))
        .toThrow('"Smart Fridge" is not one of Playwright\'s devices');
});

test('the project\'s own Playwright settings come last: top-level keys replace, use merges one level', () => {
    const config = magentoConfig(
        options({ playwright: { timeout: 30_000, expect: { timeout: 5_000 }, use: { locale: 'da-DK', trace: 'on' } } }),
        inputs(),
    );

    expect(config.timeout).toBe(30_000);
    expect(config.expect).toEqual({ timeout: 5_000 });
    expect(config.use).toMatchObject({ locale: 'da-DK', trace: 'on', actionTimeout: 20_000, storeCode: 'main' });
});

test.describe('defineMagentoConfig', () => {
    let dir = '';

    test.afterEach(() => {
        Reflect.deleteProperty(process.env, 'E2E_ENV');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('reads the .env beside the config, discovers the modules and points the setup at its own module', () => {
        dir = temporaryDirectory({
            'e2e/.env': 'E2E_ENV=staging\n',
            'magento/app/etc/config.php': '<?php return [\'modules\' => [\'Acme_One\' => 1]];',
            'magento/app/code/Acme/One/registration.php':
                '<?php \\Magento\\Framework\\Component\\ComponentRegistrar::register(\\Magento\\Framework\\Component\\ComponentRegistrar::MODULE, \'Acme_One\', __DIR__);',
            'magento/app/code/Acme/One/Test/E2e/rule.spec.ts': '',
        });
        Reflect.deleteProperty(process.env, 'E2E_ENV');

        const config = defineMagentoConfig({
            project: defineProject(sampleConfig({ magentoRoot: path.join(dir, 'magento') })),
            configDir: path.join(dir, 'e2e'),
        });

        expect(config.metadata).toEqual({ environment: 'staging' });
        expect(config.projects?.map(project => project.name)).toEqual(['desktop', 'desktop-modules', 'mobile', 'mobile-modules']);
        // The specs load the package from its sources, so the setup module is the TypeScript one beside it.
        expect(config.globalSetup).toBe(path.resolve(__dirname, '..', '..', 'src', 'config', 'preflight.ts'));
        expect(fs.existsSync(String(config.globalSetup))).toBe(true);
    });
});
