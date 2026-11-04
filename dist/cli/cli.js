"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMANDS = void 0;
exports.usageOf = usageOf;
exports.runCli = runCli;
const report_gate_1 = require("./report-gate");
const strip_traces_1 = require("./strip-traces");
const summary_1 = require("./summary");
/** The commands of `magento-e2e`, by the name the user types. */
exports.COMMANDS = new Map([
    ['strip-traces', strip_traces_1.stripTracesCommand],
    ['summary', summary_1.summaryCommand],
    ['report-gate', report_gate_1.reportGateCommand],
]);
/** The usage text: one line per command. */
function usageOf(commands) {
    const lines = [...commands].map(([name, command]) => `  magento-e2e ${name} ${command.usage}\n      ${command.summary}`);
    return `Usage:\n${lines.join('\n')}`;
}
/**
 * Runs the command `argv` names and answers with its exit code. No name, or one that is not a
 * command, prints the usage and ends with 2.
 */
function runCli(argv, context, commands = exports.COMMANDS) {
    const [name, ...args] = argv;
    const command = name === undefined ? undefined : commands.get(name);
    if (command === undefined) {
        context.err(name === undefined ? 'No command given.' : `Unknown command "${name}".`);
        context.err(usageOf(commands));
        return 2;
    }
    return command.run(args, context);
}
