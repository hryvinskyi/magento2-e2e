import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { PACKAGE_ROOT } from './consumer-run';

test('the consumer project type-checks against the package sources, its store and environment types narrowed', () => {
    test.setTimeout(120_000);

    const compiler = spawnSync(
        process.execPath,
        [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', path.join('test', 'consumer')],
        { cwd: PACKAGE_ROOT, encoding: 'utf8' },
    );

    expect(`${compiler.stdout}${compiler.stderr}`).toBe('');
    expect(compiler.status).toBe(0);
});
