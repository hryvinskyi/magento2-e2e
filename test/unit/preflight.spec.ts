import { expect, test } from '@playwright/test';
import type { PreflightSchedule, StorefrontProbe } from '../../src/config/preflight';
import { checkStorefront, DEFAULT_SCHEDULE, launchOptionsOf, projectInConfig } from '../../src/config/preflight';
import { defineProject } from '../../src/project/project';
import { sampleConfig } from './sample-project';

const URL = 'https://shop.test/';

/** A probe that gives these answers in turn, and records each URL it was asked for. */
function probe(...answers: string[]): StorefrontProbe & { readonly asked: string[] } {
    const asked: string[] = [];

    return {
        asked,
        answer(url: string): Promise<string> {
            asked.push(url);

            return Promise.resolve(answers[asked.length - 1] ?? '200');
        },
    };
}

/** The default schedule, with pauses recorded rather than waited for. */
function schedule(): PreflightSchedule & { readonly pauses: number[] } {
    const pauses: number[] = [];

    return {
        ...DEFAULT_SCHEDULE,
        pauses,
        pause(ms: number): Promise<void> {
            pauses.push(ms);

            return Promise.resolve();
        },
    };
}

test('a storefront that answers 200 at once is asked once', async () => {
    const answers = probe('200');
    const timing = schedule();

    await checkStorefront('local', URL, answers, timing);

    expect(answers.asked).toEqual([URL]);
    expect(timing.pauses).toEqual([]);
});

test('a storefront still warming up is asked again ten seconds later', async () => {
    const answers = probe('502', 'no answer (connect ECONNREFUSED)', '200');
    const timing = schedule();

    await checkStorefront('staging', URL, answers, timing);

    expect(answers.asked).toHaveLength(3);
    expect(timing.pauses).toEqual([10_000, 10_000]);
});

test('a storefront that never answers 200 refuses the run with its last answer', async () => {
    const timing = schedule();

    await expect(checkStorefront('production', URL, probe('503', '503', '503'), timing)).rejects.toThrow(
        'The production storefront is not answering: https://shop.test/ gave 503 3 times over 20 seconds. No check was run.',
    );
    expect(timing.pauses).toEqual([10_000, 10_000]);
});

test('a redirect that ends elsewhere than 200 is not an answer', async () => {
    await expect(checkStorefront('local', URL, probe('301', '404', '404'), schedule())).rejects.toThrow('gave 404 3 times');
});

test('the project is found in the config defineMagentoConfig() made', () => {
    const project = defineProject(sampleConfig());

    expect(projectInConfig([{ use: { magentoProject: project } }, { use: {} }])).toBe(project);
});

test('a config without the project is refused, naming the factory', () => {
    const copied = { ...defineProject(sampleConfig()) };
    const refusal = 'it runs only as the global setup of a config made by defineMagentoConfig()';

    expect(() => projectInConfig([])).toThrow(refusal);
    expect(() => projectInConfig([{ use: {} }])).toThrow(refusal);
    expect(() => projectInConfig([{ use: { magentoProject: copied } }])).toThrow(refusal);
});

test('the check launches the browser on the channel the config names', () => {
    expect(launchOptionsOf([{ use: { channel: 'chrome' } }, { use: {} }])).toEqual({ channel: 'chrome' });
});

test('the check launches Playwright\'s own Chromium when the config names no channel', () => {
    expect(launchOptionsOf([])).toEqual({});
    expect(launchOptionsOf([{ use: {} }])).toEqual({});
    expect(launchOptionsOf([{ use: { channel: '' } }])).toEqual({});
    expect(launchOptionsOf([{ use: { channel: undefined } }])).toEqual({});
});
