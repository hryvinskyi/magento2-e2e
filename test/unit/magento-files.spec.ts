import { expect, test } from '@playwright/test';
import { parseEnabledModules, parseModulePackages, parseRegisteredModule } from '../../src/modules/magento-files';

test.describe('the enabled modules of app/etc/config.php', () => {
    test('are the entries set to 1', () => {
        const config = `<?php
return [
    'modules' => [
        'Magento_Store' => 1,
        'Acme_Enabled'=>1,
        'Acme_Disabled' => 0,
        "Acme_Quoted" => 1,
        'Acme_Ten' => 10,
    ],
];`;

        expect([...parseEnabledModules(config)]).toEqual(['Magento_Store', 'Acme_Enabled', 'Acme_Quoted']);
    });

    test('are none in a file without modules', () => {
        expect(parseEnabledModules('<?php return [];').size).toBe(0);
    });
});

test.describe('the module a registration.php registers', () => {
    test('is found under the registrar\'s own name', () => {
        const registration = `<?php
use Magento\\Framework\\Component\\ComponentRegistrar;

ComponentRegistrar::register(ComponentRegistrar::MODULE, 'Acme_Catalog', __DIR__);`;

        expect(parseRegisteredModule(registration)).toBe('Acme_Catalog');
    });

    test('is found under an alias of the registrar', () => {
        const registration = `<?php
use Magento\\Framework\\Component\\ComponentRegistrar as Registrar;

Registrar::register(Registrar::MODULE , "Acme_Aliased", __DIR__);`;

        expect(parseRegisteredModule(registration)).toBe('Acme_Aliased');
    });

    test('is found through the fully qualified registrar', () => {
        const registration = `<?php
\\Magento\\Framework\\Component\\ComponentRegistrar::register(
    \\Magento\\Framework\\Component\\ComponentRegistrar::MODULE,
    'Acme_Qualified',
    __DIR__
);`;

        expect(parseRegisteredModule(registration)).toBe('Acme_Qualified');
    });

    test('is none when the file registers a theme', () => {
        const registration = `<?php
use Magento\\Framework\\Component\\ComponentRegistrar;

ComponentRegistrar::register(ComponentRegistrar::THEME, 'frontend/Acme/theme', __DIR__);`;

        expect(parseRegisteredModule(registration)).toBeUndefined();
    });
});

test.describe('the module packages of vendor/composer/installed.json', () => {
    const modulePackage = {
        name: 'acme/module-catalog',
        type: 'magento2-module',
        'install-path': '../acme/module-catalog',
        autoload: { files: ['registration.php'], 'psr-4': { 'Acme\\Catalog\\': '' } },
    };

    test('are read from the Composer 2 layout, with their install path', () => {
        expect(parseModulePackages({ packages: [modulePackage], dev: true })).toEqual([
            { name: 'acme/module-catalog', installPath: '../acme/module-catalog', registrationFiles: ['registration.php'] },
        ]);
    });

    test('are read from the Composer 1 layout, which records no install path', () => {
        const composerOne = { name: 'acme/module-catalog', type: 'magento2-module', autoload: { files: ['registration.php'] } };

        expect(parseModulePackages([composerOne])).toEqual([
            { name: 'acme/module-catalog', installPath: undefined, registrationFiles: ['registration.php'] },
        ]);
    });

    test('keep every registration file of a package that registers several modules', () => {
        const several = {
            ...modulePackage,
            autoload: { files: ['src/Catalog/registration.php', 'src/Sales/registration.php', 'src/functions.php', 'myregistration.php'] },
        };

        expect(parseModulePackages({ packages: [several] })[0]?.registrationFiles)
            .toEqual(['src/Catalog/registration.php', 'src/Sales/registration.php']);
    });

    test('keep a module package without registration files, with none', () => {
        const bare = { name: 'acme/module-bare', type: 'magento2-module' };

        expect(parseModulePackages({ packages: [bare] })).toEqual([
            { name: 'acme/module-bare', installPath: undefined, registrationFiles: [] },
        ]);
    });

    test('leave out packages of any other type, and entries that are not packages', () => {
        const others = [
            { ...modulePackage, name: 'acme/theme-frontend', type: 'magento2-theme' },
            { ...modulePackage, name: 'acme/library', type: 'library' },
            { type: 'magento2-module' },
            'acme/module-text',
            null,
        ];

        expect(parseModulePackages({ packages: others })).toEqual([]);
    });

    test('are refused when the file lists no packages', () => {
        expect(() => parseModulePackages({ dev: true })).toThrow('vendor/composer/installed.json lists no packages');
        expect(() => parseModulePackages('packages')).toThrow('vendor/composer/installed.json lists no packages');
    });
});
