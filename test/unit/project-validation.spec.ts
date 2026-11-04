import { expect, test } from '@playwright/test';
import { projectProblems } from '../../src/project/project-validation';
import { sampleConfig } from './sample-project';

test('a valid definition has no problems', () => {
    expect(projectProblems(sampleConfig())).toEqual([]);
});

test('a production environment may say explicitly that it checks certificates and search', () => {
    const environments = {
        production: { baseUrl: (): string => 'https://www.example.com/', production: true, ignoreHttpsErrors: false, searchServiceOptional: false },
    };

    expect(projectProblems(sampleConfig({ environments, defaultEnvironment: 'production' }))).toEqual([]);
});

test('every problem of a definition is reported, not only the first', () => {
    const problems = projectProblems(sampleConfig({
        magentoRoot: 'relative',
        defaultStore: 'missing',
        defaultEnvironment: 'missing',
        safetyTags: { order: { onProduction: false } },
    }));

    expect(problems).toEqual([
        'magentoRoot must be an absolute path; got "relative"',
        'defaultStore "missing" is not one of the stores (main, second)',
        'defaultEnvironment "missing" is not one of the environments (local, staging, production)',
        'the safety tag "order" must start with "@"',
    ]);
});
