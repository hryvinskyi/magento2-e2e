import { appendFileSync } from 'node:fs';
import type { Reporter, TestStep } from '@playwright/test/reporter';

/**
 * A reporter that writes the title of every step of the run, of every category — Playwright's own
 * calls, fixtures and hooks included — one per line to the file `E2E_CONSUMER_STEPS` names, which is
 * what an HTML report would show of them.
 */
export default class StepTitles implements Reporter {
    private readonly file: string;

    public constructor() {
        const file = process.env.E2E_CONSUMER_STEPS;

        if (file === undefined || file === '') {
            throw new Error('E2E_CONSUMER_STEPS must name the file the step titles are written to.');
        }

        this.file = file;
    }

    public onStepBegin(_test: unknown, _result: unknown, step: TestStep): void {
        appendFileSync(this.file, `${step.category}\t${step.title}\n`);
    }
}
