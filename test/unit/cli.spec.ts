import { expect, test } from '@playwright/test';
import { COMMANDS, runCli, usageOf } from '../../src/cli/cli';
import type { Command } from '../../src/cli/context';

function context(): { out: string[]; err: string[]; cli: Parameters<typeof runCli>[1] } {
    const out: string[] = [];
    const err: string[] = [];

    return { out, err, cli: { variables: {}, cwd: '/work', out: line => out.push(line), err: line => err.push(line) } };
}

test('the registry holds the three commands, each with its usage', () => {
    expect([...COMMANDS.keys()]).toEqual(['strip-traces', 'summary', 'report-gate']);
    expect(usageOf(COMMANDS)).toContain('magento-e2e strip-traces [allure-results]');
    expect(usageOf(COMMANDS)).toContain('magento-e2e report-gate [report-directory]');
});

test('a command receives the arguments after its name and its exit code is the program\'s', () => {
    const seen: (readonly string[])[] = [];
    const command: Command = {
        usage: '<x>',
        summary: 'does a thing',
        run: args => {
            seen.push(args);

            return 7;
        },
    };
    const { cli, out, err } = context();

    expect(runCli(['thing', 'a', 'b'], cli, new Map([['thing', command]]))).toBe(7);
    expect(seen).toEqual([['a', 'b']]);
    expect([out, err]).toEqual([[], []]);
});

test('an unknown command, a missing one and a name that only the prototype has print the usage and end with 2', () => {
    for (const argv of [['frobnicate'], [], ['constructor']]) {
        const { cli, err } = context();

        expect(runCli(argv, cli)).toBe(2);
        expect(err[0]).toMatch(/^(Unknown command "[a-z]+"\.|No command given\.)$/);
        expect(err[1]).toBe(usageOf(COMMANDS));
    }
});
