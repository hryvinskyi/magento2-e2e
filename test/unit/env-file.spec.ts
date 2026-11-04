import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loadEnvFile } from '../../src/config/env-file';
import { temporaryDirectory } from './temporary-files';

const NAMES = ['E2E_FILE_ONLY', 'E2E_ALREADY_SET', 'E2E_SET_EMPTY'] as const;

test.describe('the .env file beside the config', () => {
    let dir = '';

    test.afterEach(() => {
        for (const name of NAMES) {
            Reflect.deleteProperty(process.env, name);
        }

        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('adds its settings, and a variable already set wins over it, even an empty one', () => {
        dir = temporaryDirectory({ '.env': 'E2E_FILE_ONLY=from-file\nE2E_ALREADY_SET=from-file\nE2E_SET_EMPTY=from-file\n' });
        process.env.E2E_ALREADY_SET = 'from-environment';
        process.env.E2E_SET_EMPTY = '';

        loadEnvFile(dir);

        expect(process.env.E2E_FILE_ONLY).toBe('from-file');
        expect(process.env.E2E_ALREADY_SET).toBe('from-environment');
        expect(process.env.E2E_SET_EMPTY).toBe('');
    });

    test('is not required: without one nothing is loaded', () => {
        dir = temporaryDirectory({});

        expect(() => { loadEnvFile(dir); }).not.toThrow();
        expect(process.env.E2E_FILE_ONLY).toBeUndefined();
    });

    test('is looked for in the config directory only', () => {
        const loaded: string[] = [];

        dir = temporaryDirectory({});
        loadEnvFile(dir, { exists: () => true, load: file => { loaded.push(file); } });

        expect(loaded).toEqual([path.join(dir, '.env')]);
    });
});
