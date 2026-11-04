import type { Page, Request } from '@playwright/test';
/**
 * The reports an analytics endpoint would have received from a page: every request to it is stopped
 * before it leaves the browser, and the ones that report a click are counted — for a test that needs
 * to know whether a click was reported at all.
 */
export declare class ClickReports {
    private readonly clicks;
    private constructor();
    /**
     * Stops every request of the page to `endpoint` and counts those `isClick` recognises as a click
     * report. Call it before the page is opened: some reports go out with the page load.
     *
     * The route is registered on the page, which also catches reports sent as beacons. A page's route
     * runs before the context's, so it sees each report ahead of a request the context blocks, and it
     * aborts the report itself rather than passing it on. Only a route registered later on the same
     * page for the same endpoint would run before it.
     */
    static stop(page: Page, endpoint: RegExp, isClick: (request: Request) => boolean): Promise<ClickReports>;
    /** Click reports stopped so far. */
    get count(): number;
}
