import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { stripTraces, stripTracesCommand } from '../../src/cli/strip-traces';
import { temporaryDirectory } from './temporary-files';

const RESULT_WITH_TRACE = JSON.stringify({
    name: 'a test',
    attachments: [
        { name: 'screenshot', source: 'shot.png', type: 'image/png' },
        { name: 'trace', source: 'trace-1.zip', type: 'application/zip' },
    ],
    steps: [
        { name: 'trace', attachments: [{ name: 'trace', source: 'trace-2.zip' }], steps: [] },
        { name: 'open the page', attachments: [{ name: 'a download', source: 'download.zip' }], steps: [] },
        { name: 'trace', attachments: [{ name: 'trace', source: 'trace-3.bin' }, { name: 'note', source: 'note.txt' }] },
        { name: 'outer', steps: [{ name: 'trace', attachments: [{ name: 'x', source: 'nested.zip' }] }] },
    ],
});

function readJson(file: string): unknown {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('trace attachments leave the results and their files are deleted', () => {
    const dir = temporaryDirectory({
        'one-result.json': RESULT_WITH_TRACE,
        'shot.png': 'png',
        'trace-1.zip': 'zip',
        'trace-2.zip': 'zip',
        'trace-3.bin': 'bin',
        'download.zip': 'zip',
        'nested.zip': 'zip',
        'note.txt': 'note',
    });

    try {
        expect(stripTraces(dir)).toEqual({ removed: 5 });

        expect(readJson(path.join(dir, 'one-result.json'))).toEqual({
            name: 'a test',
            attachments: [{ name: 'screenshot', source: 'shot.png', type: 'image/png' }],
            steps: [
                { name: 'open the page', attachments: [], steps: [] },
                { name: 'trace', attachments: [{ name: 'note', source: 'note.txt' }] },
                { name: 'outer', steps: [] },
            ],
        });
        expect(fs.readdirSync(dir).sort()).toEqual(['note.txt', 'one-result.json', 'shot.png']);
    } finally {
        fs.rmSync(dir, { recursive: true });
    }
});

test('containers are stripped too, and files that are not results are left alone', () => {
    const dir = temporaryDirectory({
        'group-container.json': JSON.stringify({ befores: [], attachments: [{ name: 'trace', source: 't.zip' }] }),
        't.zip': 'zip',
        'environment.json': JSON.stringify({ attachments: [{ name: 'trace', source: 'keep.zip' }] }),
        'keep.zip': 'zip',
    });

    try {
        expect(stripTraces(dir).removed).toBe(1);
        expect(readJson(path.join(dir, 'group-container.json'))).toEqual({ befores: [], attachments: [] });
        expect(readJson(path.join(dir, 'environment.json'))).toEqual({ attachments: [{ name: 'trace', source: 'keep.zip' }] });
        expect(fs.existsSync(path.join(dir, 'keep.zip'))).toBe(true);
    } finally {
        fs.rmSync(dir, { recursive: true });
    }
});

test('a source outside the results directory is dropped from the result but its file is not touched', () => {
    const parent = temporaryDirectory({ 'results/x-result.json': JSON.stringify({ attachments: [{ name: 'trace', source: '../outside.zip' }] }), 'outside.zip': 'zip' });

    try {
        stripTraces(path.join(parent, 'results'));

        expect(readJson(path.join(parent, 'results', 'x-result.json'))).toEqual({ attachments: [] });
        expect(fs.existsSync(path.join(parent, 'outside.zip'))).toBe(true);
    } finally {
        fs.rmSync(parent, { recursive: true });
    }
});

test('a directory that does not exist has nothing to strip', () => {
    expect(stripTraces(path.join(path.sep, 'nonexistent', 'allure-results'))).toEqual({ removed: 0 });
});

test('the command strips the directory it is given, relative to the working directory, and prints the count', () => {
    const cwd = temporaryDirectory({ 'allure-results/r-result.json': RESULT_WITH_TRACE, 'allure-results/trace-1.zip': 'zip' });
    const lines: string[] = [];

    try {
        const code = stripTracesCommand.run([], { variables: {}, cwd, out: line => lines.push(line), err: line => lines.push(line) });

        expect(code).toBe(0);
        expect(lines).toEqual([`Removed 5 trace attachment(s) from ${path.join(cwd, 'allure-results')}`]);
    } finally {
        fs.rmSync(cwd, { recursive: true });
    }
});
