import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { enabledModules, moduleTests } from '../../src/modules/module-tests';

/** A Magento installation on disk, removed after each test. */
let root = '';

test.beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'magento2-e2e-modules-')));
});

test.afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
    const file = join(root, relativePath);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
}

function registration(module: string): string {
    return `<?php
use Magento\\Framework\\Component\\ComponentRegistrar;

ComponentRegistrar::register(ComponentRegistrar::MODULE, '${module}', __DIR__);
`;
}

function config(modules: Readonly<Record<string, 0 | 1>>): void {
    const entries = Object.entries(modules).map(([module, state]) => `        '${module}' => ${String(state)},`);

    write('app/etc/config.php', `<?php\nreturn [\n    'modules' => [\n${entries.join('\n')}\n    ],\n];\n`);
}

/** A module under app/code, optionally with tests. */
function appCodeModule(vendor: string, name: string, withTests: boolean): void {
    write(`app/code/${vendor}/${name}/registration.php`, registration(`${vendor}_${name}`));

    if (withTests) {
        write(`app/code/${vendor}/${name}/Test/E2e/rule.spec.ts`, '');
    }
}

function installed(packages: readonly unknown[]): void {
    write('vendor/composer/installed.json', JSON.stringify({ packages, dev: true }));
}

test('the enabled modules are the entries config.php sets to 1', () => {
    config({ Acme_On: 1, Acme_Off: 0 });

    expect([...enabledModules(root)]).toEqual(['Acme_On']);
});

test('a directory without config.php is not a Magento installation', () => {
    expect(() => enabledModules(root)).toThrow(`${root} is not a Magento installation: app/etc/config.php is missing`);
    expect(() => moduleTests(root)).toThrow(`${root} is not a Magento installation: app/etc/config.php is missing`);
});

test('the app/code modules with tests are listed while enabled, sorted by name', () => {
    config({ Acme_Zeta: 1, Acme_Alpha: 1, Acme_NoTests: 1, Acme_Disabled: 0 });
    appCodeModule('Acme', 'Zeta', true);
    appCodeModule('Acme', 'Alpha', true);
    appCodeModule('Acme', 'NoTests', false);
    appCodeModule('Acme', 'Disabled', true);
    write('app/code/Acme/Unregistered/Test/E2e/rule.spec.ts', '');

    expect(moduleTests(root)).toEqual([
        { module: 'Acme_Alpha', dir: join(root, 'app/code/Acme/Alpha/Test/E2e'), source: 'app/code' },
        { module: 'Acme_Zeta', dir: join(root, 'app/code/Acme/Zeta/Test/E2e'), source: 'app/code' },
    ]);
});

test('an installation without installed.json lists its app/code modules only', () => {
    config({ Acme_Alpha: 1 });
    appCodeModule('Acme', 'Alpha', true);

    expect(moduleTests(root).map(entry => entry.module)).toEqual(['Acme_Alpha']);
});

test('the module packages with tests are listed after the app/code modules', () => {
    config({ Acme_Local: 1, Acme_Catalog: 1, Acme_Sales: 1, Acme_Off: 0, Acme_Bare: 1 });
    appCodeModule('Acme', 'Local', true);
    write('vendor/acme/module-catalog/registration.php', registration('Acme_Catalog'));
    write('vendor/acme/module-catalog/Test/E2e/catalog.spec.ts', '');
    write('vendor/acme/suite/src/Sales/registration.php', registration('Acme_Sales'));
    write('vendor/acme/suite/src/Sales/Test/E2e/sales.spec.ts', '');
    write('vendor/acme/suite/src/Off/registration.php', registration('Acme_Off'));
    write('vendor/acme/suite/src/Off/Test/E2e/off.spec.ts', '');
    write('vendor/acme/module-bare/Test/E2e/bare.spec.ts', '');
    installed([
        { name: 'acme/suite', type: 'magento2-module', 'install-path': '../acme/suite', autoload: { files: ['src/Sales/registration.php', 'src/Off/registration.php'] } },
        { name: 'acme/module-catalog', type: 'magento2-module', 'install-path': '../acme/module-catalog', autoload: { files: ['registration.php'] } },
        { name: 'acme/module-bare', type: 'magento2-module', 'install-path': '../acme/module-bare' },
        { name: 'acme/library', type: 'library', 'install-path': '../acme/library', autoload: { files: ['registration.php'] } },
    ]);

    expect(moduleTests(root)).toEqual([
        { module: 'Acme_Local', dir: join(root, 'app/code/Acme/Local/Test/E2e'), source: 'app/code' },
        { module: 'Acme_Catalog', dir: join(root, 'vendor/acme/module-catalog/Test/E2e'), source: 'vendor' },
        { module: 'Acme_Sales', dir: join(root, 'vendor/acme/suite/src/Sales/Test/E2e'), source: 'vendor' },
    ]);
});

test('a Composer 1 installed.json places each package at vendor/<name>', () => {
    config({ Acme_Catalog: 1 });
    write('vendor/acme/module-catalog/registration.php', registration('Acme_Catalog'));
    write('vendor/acme/module-catalog/Test/E2e/catalog.spec.ts', '');
    write('vendor/composer/installed.json', JSON.stringify([
        { name: 'acme/module-catalog', type: 'magento2-module', autoload: { files: ['registration.php'] } },
    ]));

    expect(moduleTests(root)).toEqual([
        { module: 'Acme_Catalog', dir: join(root, 'vendor/acme/module-catalog/Test/E2e'), source: 'vendor' },
    ]);
});

test('a package installed as a symbolic link is listed under its real path', () => {
    config({ Acme_Linked: 1 });
    write('packages/linked/registration.php', registration('Acme_Linked'));
    write('packages/linked/Test/E2e/linked.spec.ts', '');
    mkdirSync(join(root, 'vendor/acme'), { recursive: true });
    symlinkSync(join('..', '..', 'packages', 'linked'), join(root, 'vendor/acme/linked'), 'dir');
    installed([
        { name: 'acme/linked', type: 'magento2-module', 'install-path': '../acme/linked', autoload: { files: ['registration.php'] } },
    ]);

    expect(moduleTests(root)).toEqual([
        { module: 'Acme_Linked', dir: join(root, 'packages/linked/Test/E2e'), source: 'vendor' },
    ]);
});

test('a module both app/code and a package register is listed once, as the app/code one', () => {
    config({ Acme_Shared: 1 });
    appCodeModule('Acme', 'Shared', true);
    write('vendor/acme/module-shared/registration.php', registration('Acme_Shared'));
    write('vendor/acme/module-shared/Test/E2e/shared.spec.ts', '');
    installed([
        { name: 'acme/module-shared', type: 'magento2-module', 'install-path': '../acme/module-shared', autoload: { files: ['registration.php'] } },
    ]);

    expect(moduleTests(root)).toEqual([
        { module: 'Acme_Shared', dir: join(root, 'app/code/Acme/Shared/Test/E2e'), source: 'app/code' },
    ]);
});

test('a registration file that is missing or registers no module is skipped', () => {
    config({ Acme_Theme: 1 });
    write('vendor/acme/theme/registration.php', '<?php\nComponentRegistrar::register(ComponentRegistrar::THEME, \'frontend/Acme/theme\', __DIR__);\n');
    write('vendor/acme/theme/Test/E2e/theme.spec.ts', '');
    installed([
        { name: 'acme/theme', type: 'magento2-module', 'install-path': '../acme/theme', autoload: { files: ['registration.php'] } },
        { name: 'acme/gone', type: 'magento2-module', 'install-path': '../acme/gone', autoload: { files: ['registration.php'] } },
    ]);

    expect(moduleTests(root)).toEqual([]);
});

test('an installed.json that is not JSON is refused, naming the file', () => {
    config({});
    write('vendor/composer/installed.json', '{ not json');

    expect(() => moduleTests(root)).toThrow(`${join(root, 'vendor/composer/installed.json')} is not valid JSON`);
});
