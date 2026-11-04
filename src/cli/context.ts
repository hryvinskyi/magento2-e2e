import type { EnvironmentVariables } from '../environment/variables';

/** What a command may touch besides its arguments: the process settings, the working directory and the two output streams. */
export interface CliContext {
    readonly variables: EnvironmentVariables;
    /** The directory relative paths are resolved against. */
    readonly cwd: string;
    /** Writes one line to the standard output. */
    out(line: string): void;
    /** Writes one line to the standard error. */
    err(line: string): void;
}

/** A command of the `magento-e2e` program: the arguments after its name, and the exit code it ends with. */
export interface Command {
    /** The command's arguments as the user typed them, for the usage text: `[allure-results]`. */
    readonly usage: string;
    /** What the command does, in one line. */
    readonly summary: string;
    run(args: readonly string[], context: CliContext): number;
}
