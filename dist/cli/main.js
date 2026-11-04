#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cli_1 = require("./cli");
process.exitCode = (0, cli_1.runCli)(process.argv.slice(2), {
    variables: process.env,
    cwd: process.cwd(),
    out: line => { console.log(line); },
    err: line => { console.error(line); },
});
