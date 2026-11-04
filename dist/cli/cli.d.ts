import type { Command, CliContext } from './context';
/** The commands of `magento-e2e`, by the name the user types. */
export declare const COMMANDS: ReadonlyMap<string, Command>;
/** The usage text: one line per command. */
export declare function usageOf(commands: ReadonlyMap<string, Command>): string;
/**
 * Runs the command `argv` names and answers with its exit code. No name, or one that is not a
 * command, prints the usage and ends with 2.
 */
export declare function runCli(argv: readonly string[], context: CliContext, commands?: ReadonlyMap<string, Command>): number;
