import fs from 'node:fs';
import path from 'node:path';
import type { Command } from './context';
import type { JsonObject } from './json-values';
import { isJsonObject, listOf, textOf } from './json-values';

/** The results of a run the shared report is built from: one file per test, one per group of tests. */
const RESULT_FILE = /-(?:result|container)\.json$/;

/** The name the reporter gives the attachment of a Playwright trace, and the step it wraps it in. */
const TRACE_NAME = 'trace';

/** What stripping the traces out of a results directory did. */
export interface StripOutcome {
    /** How many trace attachments were taken out of the results. */
    readonly removed: number;
}

/**
 * Takes Playwright traces out of the results the shared report is built from. A trace records every
 * request with its headers (a staging login, session cookies), and the shared report is read outside
 * the team; the internal Playwright report keeps the traces.
 *
 * Each trace attachment is dropped from its result and its file deleted, and the step the reporter
 * wraps it in goes with it once nothing else is in that step. A directory that does not exist has
 * nothing to strip.
 */
export function stripTraces(dir: string): StripOutcome {
    const root = path.resolve(dir);
    let removed = 0;

    const deleteAttachment = (source: string): void => {
        const file = path.resolve(root, source);

        // A source that points out of the results directory is not one of the reporter's files.
        if (file.startsWith(root + path.sep)) {
            fs.rmSync(file, { force: true });
        }

        removed += 1;
    };

    for (const name of fs.existsSync(root) ? fs.readdirSync(root) : []) {
        if (!RESULT_FILE.test(name)) {
            continue;
        }

        const file = path.join(root, name);
        const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));

        if (isJsonObject(parsed)) {
            fs.writeFileSync(file, JSON.stringify(withoutTraces(parsed, deleteAttachment)));
        }
    }

    return { removed };
}

/** A copy of a result node without its trace attachments, and without the steps they leave empty. */
function withoutTraces(node: JsonObject, onTrace: (source: string) => void): JsonObject {
    const copy: Record<string, unknown> = { ...node };

    if (Array.isArray(node.attachments)) {
        copy.attachments = listOf(node.attachments).filter(attachment => {
            const source = traceSource(attachment);

            if (source !== undefined) {
                onTrace(source);
            }

            return source === undefined;
        });
    }

    if (Array.isArray(node.steps)) {
        copy.steps = listOf(node.steps)
            .map(step => (isJsonObject(step) ? withoutTraces(step, onTrace) : step))
            .filter(step => !isEmptyTraceStep(step));
    }

    return copy;
}

/**
 * The file a trace attachment names, `''` for a trace that has none; `undefined` for an attachment
 * that is not a trace.
 */
function traceSource(attachment: unknown): string | undefined {
    if (!isJsonObject(attachment)) {
        return undefined;
    }

    const source = textOf(attachment.source) ?? '';

    return attachment.name === TRACE_NAME || /\.zip$/i.test(source) ? source : undefined;
}

function isEmptyTraceStep(step: unknown): boolean {
    return isJsonObject(step)
        && step.name === TRACE_NAME
        && listOf(step.attachments).length === 0
        && listOf(step.steps).length === 0;
}

export const stripTracesCommand: Command = {
    usage: '[allure-results]',
    summary: 'Takes Playwright traces out of the results the shared report is built from',
    run(args, context): number {
        const dir = path.resolve(context.cwd, args[0] ?? 'allure-results');
        const { removed } = stripTraces(dir);

        context.out(`Removed ${String(removed)} trace attachment(s) from ${dir}`);

        return 0;
    },
};
