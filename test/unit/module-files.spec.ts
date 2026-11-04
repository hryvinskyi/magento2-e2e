import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { nodeModuleFiles } from '../../src/modules/module-files';

let root = '';

test.beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'magento2-e2e-files-')));
    mkdirSync(join(root, 'real/child'), { recursive: true });
    writeFileSync(join(root, 'real/file.txt'), 'text');
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
});

test.afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

test('reads a file\'s text, and nothing for a missing file or one under a file', () => {
    expect(nodeModuleFiles.readText(join(root, 'real/file.txt'))).toBe('text');
    expect(nodeModuleFiles.readText(join(root, 'missing.txt'))).toBeUndefined();
    expect(nodeModuleFiles.readText(join(root, 'real/file.txt/below'))).toBeUndefined();
});

test('still fails on a path it cannot read for another reason', () => {
    expect(() => nodeModuleFiles.readText(join(root, 'real'))).toThrow();
});

test('lists sub-directories as absolute paths, and none for a missing directory', () => {
    expect(nodeModuleFiles.subdirectories(join(root, 'real'))).toEqual([join(root, 'real/child')]);
    expect(nodeModuleFiles.subdirectories(join(root, 'missing'))).toEqual([]);
});

test('tells directories from files, following symbolic links', () => {
    expect(nodeModuleFiles.isDirectory(join(root, 'real'))).toBe(true);
    expect(nodeModuleFiles.isDirectory(join(root, 'link'))).toBe(true);
    expect(nodeModuleFiles.isDirectory(join(root, 'real/file.txt'))).toBe(false);
    expect(nodeModuleFiles.isDirectory(join(root, 'missing'))).toBe(false);
});

test('resolves symbolic links to the real path', () => {
    expect(nodeModuleFiles.realPath(join(root, 'link/child'))).toBe(join(root, 'real/child'));
});
