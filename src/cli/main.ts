#!/usr/bin/env node
import { runCli } from './cli';

process.exitCode = runCli(process.argv.slice(2), {
    variables: process.env,
    cwd: process.cwd(),
    out: line => { console.log(line); },
    err: line => { console.error(line); },
});
