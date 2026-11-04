import type { Page } from '@playwright/test';
/**
 * The requests of a few kinds that a page has sent and not yet had answered. It sees only requests
 * sent after it started watching.
 */
export declare class RequestsInFlight {
    private readonly pending;
    private readonly what;
    private constructor();
    /** Starts watching the requests whose URL matches one of `urls`; `what` names them in a failure. */
    static watch(page: Page, urls: readonly RegExp[], what: string): RequestsInFlight;
    /** Resolves once every watched request sent so far has been answered or has failed. */
    settled(): Promise<void>;
}
