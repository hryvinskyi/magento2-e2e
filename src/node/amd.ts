import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

type Factory = (...args: unknown[]) => unknown;

interface Definition {
    readonly dependencies: readonly string[];
    readonly factory: Factory;
}

/**
 * Loads a RequireJS (AMD) module in plain Node, so a pure module — a rule, a calculation, a small
 * state model — is tested without a browser.
 *
 * The file runs in this process's own realm through `node:vm`, with a `define` that hands the factory
 * the values given in `dependencies`, keyed by the dependency id exactly as the module writes it
 * (`'../model/constants'`, `'ko'`). An id missing from the map fails the load and names the id: a
 * module is never run against a dependency nobody provided. The AMD `exports` id is the one exception;
 * it receives a fresh object, which is the module's value when the factory returns nothing (how UMD
 * files define themselves).
 *
 * What the factory returns is `unknown`: the caller narrows it with a type guard before use.
 *
 * @param filePath     the module's file; a relative path is resolved against the working directory
 * @param dependencies the value of each dependency id the module lists
 */
export function loadAmdModule(filePath: string, dependencies: Readonly<Record<string, unknown>> = {}): unknown {
    const file = path.resolve(filePath);
    const definitions: Definition[] = [];
    const define = Object.assign(
        (...args: unknown[]): void => {
            definitions.push(parseDefineCall(args, file));
        },
        { amd: {} },
    );
    const run: unknown = new vm.Script(`(function (define) {\n${fs.readFileSync(file, 'utf8')}\n})`, { filename: file })
        .runInThisContext();

    if (!isCallable(run)) {
        throw new Error(`${file} could not be wrapped for loading.`);
    }

    run(define);

    const [definition, ...more] = definitions;

    if (definition === undefined || more.length > 0) {
        throw new Error(`${file} must call define() exactly once; it called it ${String(definitions.length)} times.`);
    }

    const exportsObject = {};
    const args = definition.dependencies.map((id): unknown => {
        if (id === 'exports') {
            return exportsObject;
        }

        if (!Object.hasOwn(dependencies, id)) {
            throw new Error(`${file} depends on "${id}", which the test did not provide.`);
        }

        return dependencies[id];
    });
    const value = definition.factory(...args);

    return value === undefined && definition.dependencies.includes('exports') ? exportsObject : value;
}

/** `define(factory)` or `define([ids], factory)` — the two anonymous forms of the AMD contract. */
function parseDefineCall(args: readonly unknown[], file: string): Definition {
    const [first, second] = args;

    if (args.length === 1 && isCallable(first)) {
        return { dependencies: [], factory: first };
    }

    if (args.length === 2 && isIdList(first) && isCallable(second)) {
        return { dependencies: first, factory: second };
    }

    throw new Error(`${file} calls define() with a form this loader does not support; use define([ids], factory).`);
}

function isCallable(value: unknown): value is Factory {
    return typeof value === 'function';
}

function isIdList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(id => typeof id === 'string');
}
