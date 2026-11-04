import path from 'node:path';
import { expect, test } from '@playwright/test';
import { linkPathRepositoryPackage, PACKAGE_ROOT, runConsumer } from './consumer-run';
import { PROJECT_NAMES } from './facts';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const MAGENTO_ROOT = path.join(PACKAGE_ROOT, 'test', 'consumer', 'magento');

test('the package suites walk only the directories their packages are installed in', async () => {
    linkPathRepositoryPackage();

    const listed = await runConsumer({ variables: { E2E_ENV: 'local' }, args: ['--list'] });
    const withoutPackages = await runConsumer({
        variables: { E2E_ENV: 'local' },
        args: ['--list', ...PROJECT_NAMES.filter(name => !name.includes('-packages')).map(name => `--project=${name}`)],
    });
    const testDirs = Object.fromEntries(listed.report.projects.map(project => [project.name, project.testDir]));

    expect(listed.report.projects.map(project => project.name)).toEqual(PROJECT_NAMES);
    expect(testDirs['desktop-packages-vendor']).toBe(path.join(MAGENTO_ROOT, 'vendor', 'acme', 'module-package', 'Test', 'E2e'));
    expect(testDirs['desktop-packages-packages']).toBe(path.join(MAGENTO_ROOT, 'packages', 'module-linked', 'Test', 'E2e'));
    expect(Object.values(testDirs)).not.toContain(MAGENTO_ROOT);
    expect(listed.received).toEqual([]);

    test.info().annotations.push(
        { type: 'list with the package suites', description: `${listed.durationMs.toFixed(0)} ms` },
        { type: 'list without the package suites', description: `${withoutPackages.durationMs.toFixed(0)} ms` },
    );
});
