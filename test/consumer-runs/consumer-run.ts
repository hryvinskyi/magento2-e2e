import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Report } from './report';
import { parseReport } from './report';

/** The package's own directory: the runs start there, as a developer would. */
export const PACKAGE_ROOT: string = path.resolve(__dirname, '..', '..');

const CONSUMER_DIR = path.join(PACKAGE_ROOT, 'test', 'consumer');
const MAGENTO_ROOT = path.join(CONSUMER_DIR, 'magento');

/** A request the consumer's page server received. */
export interface Received {
    readonly method: string;
    readonly host: string;
    readonly path: string;
}

export interface ConsumerRun {
    readonly exitCode: number | null;
    readonly report: Report;
    /** Every request that reached the page server, in order. */
    readonly received: readonly Received[];
    /** The port the run's page server listened on. */
    readonly port: number;
    readonly durationMs: number;
}

/** What a run is started with. */
export interface RunSettings {
    /** The settings of the run besides those every run is given (port, request log, report file). */
    readonly variables?: Readonly<Record<string, string>>;
    /** Settings that name the run's page server, whose free port is only known once the run starts. */
    readonly variablesOnPort?: (port: number) => Readonly<Record<string, string>>;
    /** Arguments after `playwright test -c test/consumer`. */
    readonly args?: readonly string[];
}

/**
 * Installs the linked package the way a Composer path repository does: `vendor/other/module-linked`
 * is a symbolic link to `packages/module-linked`. Version control does not keep such a link portably,
 * so it is made here; making it again is a no-op.
 */
export function linkPathRepositoryPackage(): void {
    const link = path.join(MAGENTO_ROOT, 'vendor', 'other', 'module-linked');
    const target = path.join(MAGENTO_ROOT, 'packages', 'module-linked');

    if (linksTo(link, target)) {
        return;
    }

    fs.mkdirSync(path.dirname(link), { recursive: true });

    try {
        fs.symlinkSync(target, link, 'junction');
    } catch (error) {
        if (!(isCode(error, 'EEXIST') && linksTo(link, target))) {
            throw error;
        }
    }
}

/**
 * Runs the consumer project with Playwright in a child process, as a fresh run on a port of its own,
 * and answers with its JSON report and the requests its page server received.
 */
export async function runConsumer(settings: RunSettings = {}): Promise<ConsumerRun> {
    const port = await freePort();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magento2-e2e-consumer-'));
    const reportFile = path.join(workDir, 'report.json');
    const logFile = path.join(workDir, 'requests.log');
    const started = performance.now();

    try {
        const exitCode = await run(process.execPath, [
            require.resolve('@playwright/test/cli'),
            'test',
            '-c',
            path.relative(PACKAGE_ROOT, CONSUMER_DIR),
            '--reporter=json',
            '--retries=0',
            `--output=${path.join(workDir, 'results')}`,
            ...(settings.args ?? []),
        ], {
            ...freshEnvironment(process.env),
            ...settings.variables,
            ...settings.variablesOnPort?.(port),
            E2E_CONSUMER_PORT: String(port),
            E2E_CONSUMER_LOG: logFile,
            PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile,
        });
        const durationMs = performance.now() - started;

        if (!fs.existsSync(reportFile)) {
            throw new Error(`The consumer run (exit code ${String(exitCode)}) wrote no report.`);
        }

        return {
            exitCode,
            report: parseReport(fs.readFileSync(reportFile, 'utf8')),
            received: fs.existsSync(logFile) ? parseLog(fs.readFileSync(logFile, 'utf8')) : [],
            port,
            durationMs,
        };
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}

/**
 * The parent's environment without what makes a child run part of the parent's: Playwright's own
 * run variables, and every `E2E_` setting, so a run is defined only by what its spec passes.
 */
function freshEnvironment(variables: NodeJS.ProcessEnv): Record<string, string> {
    return Object.fromEntries(
        Object.entries(variables)
            .filter((entry): entry is [string, string] => entry[1] !== undefined)
            .filter(([name]) => !/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PWTEST_|PLAYWRIGHT_|E2E_)/.test(name)),
    );
}

/** Runs a command in the package's directory and answers with its exit code; its output is kept for a failure. */
function run(command: string, args: readonly string[], env: Readonly<Record<string, string>>): Promise<number | null> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd: PACKAGE_ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
        const stderr: Buffer[] = [];

        child.stderr.on('data', (chunk: Buffer) => {
            stderr.push(chunk);
        });
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0 && code !== 1) {
                reject(new Error(`The consumer run exited with ${String(code)}: ${Buffer.concat(stderr).toString('utf8')}`));

                return;
            }

            resolve(code);
        });
    });
}

/** A TCP port nothing listens on right now. */
function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', reject);
        server.listen(0, () => {
            const address = server.address();

            server.close(() => {
                if (address === null || typeof address === 'string') {
                    reject(new Error('The free port probe is not listening on a TCP port.'));
                } else {
                    resolve(address.port);
                }
            });
        });
    });
}

function parseLog(text: string): readonly Received[] {
    return text.split('\n').filter(line => line !== '').map((line): Received => {
        const entry: unknown = JSON.parse(line);

        if (typeof entry !== 'object' || entry === null) {
            throw new Error(`The page server logged an entry that is not an object: ${line}`);
        }

        const method = 'method' in entry ? entry.method : undefined;
        const host = 'host' in entry ? entry.host : undefined;
        const requestPath = 'path' in entry ? entry.path : undefined;

        if (typeof method !== 'string' || typeof host !== 'string' || typeof requestPath !== 'string') {
            throw new Error(`The page server logged an entry without method, host and path: ${line}`);
        }

        return { method, host, path: requestPath };
    });
}

function linksTo(link: string, target: string): boolean {
    try {
        return fs.lstatSync(link).isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(target);
    } catch (error) {
        if (isCode(error, 'ENOENT')) {
            return false;
        }

        throw error;
    }
}

function isCode(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && error.code === code;
}
