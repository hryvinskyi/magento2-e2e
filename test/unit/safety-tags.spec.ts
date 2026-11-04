import { expect, test } from '@playwright/test';
import type { Environment } from '../../src/environment/environment';
import { defineProject } from '../../src/project/project';
import {
    CART_TAG,
    declaredSafetyTag,
    MUTATING_TAG,
    READONLY_TAG,
    SafetyTagRegistry,
    SEARCH_SERVICE_TAG,
    isCoreSafetyTag,
} from '../../src/safety/safety-tags';
import { sampleConfig } from './sample-project';

const project = defineProject(sampleConfig());
const production: Environment = project.environment({ E2E_ENV: 'production' });
const local: Environment = project.environment({});
const pointedAtTheLiveShop: Environment = project.environment({ E2E_BASE_URL_MAIN: 'https://www.example.com/' });

test('the core tags', () => {
    expect([READONLY_TAG, CART_TAG, MUTATING_TAG]).toEqual(['@readonly', '@cart', '@mutating']);
    expect(new SafetyTagRegistry({}).tags()).toEqual(['@readonly', '@cart', '@mutating']);
});

test('the search tag is not a safety tag', () => {
    expect(SEARCH_SERVICE_TAG).toBe('@search');
    expect(isCoreSafetyTag(SEARCH_SERVICE_TAG)).toBe(false);
    expect(new SafetyTagRegistry({}).refusal([SEARCH_SERVICE_TAG], production))
        .toBe('a test without a safety tag never runs against production');
});

test('the project\'s tags follow the core ones, in the order the project gives them', () => {
    const registry = new SafetyTagRegistry({ '@seeded': { onProduction: false }, '@order': { onProduction: true } });

    expect(registry.tags()).toEqual(['@readonly', '@cart', '@mutating', '@seeded', '@order']);
});

test('a refusal of a tag\'s own is asked with the environment the test runs in', () => {
    const asked: string[] = [];
    const registry = new SafetyTagRegistry({
        '@seeded': {
            onProduction: false,
            refusal: environment => {
                asked.push(environment.name);

                return undefined;
            },
        },
    });

    expect(registry.refusal(['@seeded'], local)).toBeUndefined();
    expect(registry.refusal(['@seeded'], production)).toBe('@seeded tests never run against production');
    expect(asked).toEqual(['local', 'production']);
});

test('a rule is not asked for a tag the test does not carry', () => {
    const registry = new SafetyTagRegistry({
        '@seeded': { onProduction: false, refusal: () => 'never asked' },
    });

    expect(registry.refusal(['@readonly'], local)).toBeUndefined();
});

test('a project\'s tag that forbids production is refused on a run pointed at the live shop', () => {
    const registry = new SafetyTagRegistry({ '@seeded': { onProduction: false } });

    expect(registry.refusal(['@seeded'], pointedAtTheLiveShop)).toBe('@seeded tests never run against the live shop');
    expect(registry.refusal(['@readonly', '@seeded'], pointedAtTheLiveShop)).toBe('@seeded tests never run against the live shop');
});

test('a tag\'s own refusal comes before the rule that protects the live shop', () => {
    const registry = new SafetyTagRegistry({ '@seeded': { onProduction: false, refusal: () => 'needs a seed' } });

    expect(registry.refusal(['@seeded'], pointedAtTheLiveShop)).toBe('needs a seed');
    expect(registry.refusal(['@seeded'], production)).toBe('needs a seed');
});

test('isCoreSafetyTag knows the three core tags only', () => {
    expect(['@readonly', '@cart', '@mutating', '@order', 'readonly'].map(isCoreSafetyTag))
        .toEqual([true, true, true, false, false]);
});

test.describe('the safety tag a test declares', () => {
    const tags = project.safetyTags();

    test('is the one safety tag among its tags', () => {
        expect(declaredSafetyTag(tags, ['@smoke', CART_TAG, SEARCH_SERVICE_TAG], 'adds to the cart')).toBe(CART_TAG);
    });

    test('must be there: a test without one is refused, naming it', () => {
        expect(() => declaredSafetyTag(tags, ['@smoke'], 'opens the home page'))
            .toThrow('A test declares exactly one of @readonly, @cart, @mutating; "opens the home page" declares none.');
    });

    test('must be alone: a test with two is refused, naming both', () => {
        expect(() => declaredSafetyTag(tags, [READONLY_TAG, MUTATING_TAG], 'places an order'))
            .toThrow('A test declares exactly one of @readonly, @cart, @mutating; "places an order" declares @readonly, @mutating.');
    });

    test('may be one of the project\'s own tags', () => {
        const orderTags = defineProject(sampleConfig({ safetyTags: { '@order': { onProduction: false } } })).safetyTags();

        expect(declaredSafetyTag(orderTags, ['@order'], 'pays')).toBe('@order');
        expect(() => declaredSafetyTag(orderTags, [], 'pays'))
            .toThrow('A test declares exactly one of @readonly, @cart, @mutating, @order; "pays" declares none.');
    });
});
