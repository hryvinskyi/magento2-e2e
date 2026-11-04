import type { Command, CliContext } from './context';
import { reportGateCommand } from './report-gate';
import { stripTracesCommand } from './strip-traces';
import { summaryCommand } from './summary';

/** The commands of `magento-e2e`, by the name the user types. */
export const COMMANDS: ReadonlyMap<string, Command> = new Map([
    ['strip-traces', stripTracesCommand],
    ['summary', summaryCommand],
    ['report-gate', reportGateCommand],
]);

/** The usage text: one line per command. */
export function usageOf(commands: ReadonlyMap<string, Command>): string {
    const lines = [...commands].map(([name, command]) => `  magento-e2e ${name} ${command.usage}\n      ${command.summary}`);

    return `Usage:\n${lines.join('\n')}`;
}

/**
 * Runs the command `argv` names and answers with its exit code. No name, or one that is not a
 * command, prints the usage and ends with 2.
 */
export function runCli(argv: readonly string[], context: CliContext, commands: ReadonlyMap<string, Command> = COMMANDS): number {
    const [name, ...args] = argv;
    const command = name === undefined ? undefined : commands.get(name);

    if (command === undefined) {
        context.err(name === undefined ? 'No command given.' : `Unknown command "${name}".`);
        context.err(usageOf(commands));

        return 2;
    }

    return command.run(args, context);
}
