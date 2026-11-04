import { expect, test } from '@playwright/test';
import { keepsEvidence } from '../../src/evidence';

test.describe('keeping evidence', () => {
    const original = process.env.E2E_EVIDENCE;

    test.afterEach(() => {
        if (original === undefined) {
            delete process.env.E2E_EVIDENCE;
        } else {
            process.env.E2E_EVIDENCE = original;
        }
    });

    test('is on only when E2E_EVIDENCE is 1, read each time it is asked', () => {
        delete process.env.E2E_EVIDENCE;
        expect(keepsEvidence()).toBe(false);

        process.env.E2E_EVIDENCE = '1';
        expect(keepsEvidence()).toBe(true);

        process.env.E2E_EVIDENCE = '0';
        expect(keepsEvidence()).toBe(false);

        process.env.E2E_EVIDENCE = 'yes';
        expect(keepsEvidence()).toBe(false);
    });
});
