import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { temporaryDirectory } from './temporary-files';

const HOOK = path.resolve(__dirname, '..', '..', 'templates', 'deploy-hook', 'notify-github.sh');
const TOKEN = 'token-placeholder';
const REPOSITORY = 'acme/shop';

/** What the hook did with curl: the arguments curl was started with, one a line, and what it read on stdin. */
interface Announcement {
    readonly exitCode: number | null;
    readonly curlArguments: string;
    readonly curlStdin: string;
}

/**
 * A `curl` that records its arguments beside itself and exits with `exitCode`. Like the real one it
 * reads stdin only when told to, so a header handed over there arrives only with `@-` in the arguments.
 */
function stubCurl(exitCode: number): string {
    const directory = temporaryDirectory({
        'curl': [
            '#!/usr/bin/env bash',
            'here="$(dirname "$0")"',
            'printf \'%s\\n\' "$@" > "${here}/arguments"',
            ': > "${here}/stdin"',
            'for argument in "$@"; do',
            '    if [ "$argument" = "@-" ]; then cat > "${here}/stdin"; fi',
            'done',
            `exit ${String(exitCode)}`,
            '',
        ].join('\n'),
    });

    fs.chmodSync(path.join(directory, 'curl'), 0o755);

    return directory;
}

/** Runs the real hook with the stub first on the `PATH`, as a deployment tool would run it. */
function announce(directory: string): Announcement {
    const hook = spawnSync('bash', [HOOK, 'production', 'abc123'], {
        encoding: 'utf8',
        env: {
            PATH: `${directory}${path.delimiter}${process.env.PATH ?? ''}`,
            HOME: directory,
            GITHUB_E2E_REPOSITORY: REPOSITORY,
            GITHUB_E2E_TOKEN: TOKEN,
        },
    });

    return {
        exitCode: hook.status,
        curlArguments: fs.readFileSync(path.join(directory, 'arguments'), 'utf8'),
        curlStdin: fs.readFileSync(path.join(directory, 'stdin'), 'utf8'),
    };
}

test.describe('the deployment hook', () => {
    let directory = '';

    test.afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    for (const curlExit of [0, 22]) {
        test(`hands the token over on stdin and exits 0 when curl exits ${String(curlExit)}`, () => {
            directory = stubCurl(curlExit);

            const announcement = announce(directory);

            expect(announcement.curlArguments).not.toContain(TOKEN);
            expect(announcement.curlStdin).toBe(`Authorization: Bearer ${TOKEN}\n`);
            expect(announcement.curlArguments).toContain(`https://api.github.com/repos/${REPOSITORY}/dispatches`);
            expect(announcement.exitCode).toBe(0);
        });
    }
});
