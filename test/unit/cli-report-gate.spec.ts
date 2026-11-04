import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { credentialsDigest, reportGateCommand, workerSource } from '../../src/cli/report-gate';
import type { EnvironmentVariables } from '../../src/environment/variables';
import { temporaryDirectory } from './temporary-files';

const VARIABLES: EnvironmentVariables = {
    E2E_REPORT_USER: 'reader',
    E2E_REPORT_PASSWORD: 's3cret pass',
    E2E_REPORT_TITLE: 'Acme storefront',
};

interface Worker {
    fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }): Promise<Response>;
}

function run(variables: EnvironmentVariables, args: readonly string[] = []): { code: number; cwd: string; err: string[] } {
    const cwd = temporaryDirectory({});
    const err: string[] = [];
    const code = reportGateCommand.run(args, { variables, cwd, out: () => undefined, err: line => err.push(line) });

    return { code, cwd, err };
}

/** Loads a generated worker as an ES module, from a directory that declares so. */
async function loadWorker(source: string): Promise<Worker> {
    const dir = temporaryDirectory({ 'package.json': '{"type":"module"}' });
    const file = path.join(dir, '_worker.js');

    fs.writeFileSync(file, source);

    try {
        const loaded: unknown = await import(pathToFileURL(file).href);

        if (typeof loaded !== 'object' || loaded === null || !('default' in loaded) || !isWorker(loaded.default)) {
            throw new Error('The generated file does not export a worker.');
        }

        return loaded.default;
    } finally {
        fs.rmSync(dir, { recursive: true });
    }
}

function isWorker(value: unknown): value is Worker {
    return typeof value === 'object' && value !== null && 'fetch' in value && typeof value.fetch === 'function';
}

const assets = {
    ASSETS: {
        fetch: (): Promise<Response> => Promise.resolve(new Response('the report', { status: 200, headers: { 'Cache-Control': 'public' } })),
    },
};

function basic(login: string): Request {
    return new Request('https://reports.example.com/', {
        headers: { Authorization: `Basic ${Buffer.from(login, 'utf8').toString('base64')}` },
    });
}

test('the gate holds the digest of the login and not the password', () => {
    const { code, cwd } = run(VARIABLES, ['built-report']);

    try {
        const source = fs.readFileSync(path.join(cwd, 'built-report', '_worker.js'), 'utf8');

        expect(code).toBe(0);
        expect(source).toContain(credentialsDigest('reader', 's3cret pass'));
        expect(credentialsDigest('reader', 's3cret pass')).toMatch(/^[0-9a-f]{64}$/);
        expect(source).not.toContain('s3cret');
        expect(source).toContain('Basic realm=\\"Acme storefront test reports\\"');
    } finally {
        fs.rmSync(cwd, { recursive: true });
    }
});

test('without a user or without a password nothing is written and the command fails', () => {
    for (const variables of [
        { E2E_REPORT_PASSWORD: 'pass' },
        { E2E_REPORT_USER: 'reader' },
        { E2E_REPORT_USER: 'reader', E2E_REPORT_PASSWORD: '' },
        {},
    ]) {
        const { code, cwd, err } = run(variables);

        try {
            expect(code).toBe(1);
            expect(err.join('\n')).toContain('E2E_REPORT_USER and E2E_REPORT_PASSWORD');
            expect(fs.readdirSync(cwd)).toEqual([]);
        } finally {
            fs.rmSync(cwd, { recursive: true });
        }
    }
});

test('the default report directory is allure-report, and the default realm names the default title', () => {
    const { code, cwd } = run({ E2E_REPORT_USER: 'reader', E2E_REPORT_PASSWORD: 'pass' });

    try {
        expect(code).toBe(0);
        expect(fs.readFileSync(path.join(cwd, 'allure-report', '_worker.js'), 'utf8')).toContain('Storefront checks test reports');
    } finally {
        fs.rmSync(cwd, { recursive: true });
    }
});

test('the worker serves the report to the right login only', async () => {
    const worker = await loadWorker(workerSource(credentialsDigest('reader', 's3cret pass'), 'Acme test reports'));

    const served = await worker.fetch(basic('reader:s3cret pass'), assets);

    expect(served.status).toBe(200);
    expect(await served.text()).toBe('the report');
    expect(served.headers.get('Cache-Control')).toBe('private, no-store');
    expect(served.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');

    for (const request of [
        basic('reader:wrong'),
        basic('other:s3cret pass'),
        basic('reader:s3cret pass '),
        new Request('https://reports.example.com/'),
        new Request('https://reports.example.com/', { headers: { Authorization: 'Bearer abc' } }),
        new Request('https://reports.example.com/', { headers: { Authorization: 'Basic ***' } }),
    ]) {
        const refused = await worker.fetch(request, assets);

        expect(refused.status).toBe(401);
        expect(refused.headers.get('WWW-Authenticate')).toBe('Basic realm="Acme test reports", charset="UTF-8"');
        expect(refused.headers.get('Cache-Control')).toBe('no-store');
        expect(await refused.text()).not.toContain('the report');
    }
});

test('a password with characters outside ASCII is compared as UTF-8', async () => {
    const worker = await loadWorker(workerSource(credentialsDigest('reader', 'pässwörd'), 'Acme test reports'));

    expect((await worker.fetch(basic('reader:pässwörd'), assets)).status).toBe(200);
    expect((await worker.fetch(basic('reader:passwoerd'), assets)).status).toBe(401);
});

test('a title with a quote or a control character cannot break out of the challenge header', async () => {
    const source = workerSource(credentialsDigest('reader', 'pass'), 'Acme "quoted"\\ title\n');
    const worker = await loadWorker(source);
    const refused = await worker.fetch(new Request('https://reports.example.com/'), assets);

    expect(refused.headers.get('WWW-Authenticate')).toBe('Basic realm="Acme quoted title", charset="UTF-8"');
});
