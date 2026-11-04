import { expect } from '@playwright/test';
import type { Page, Request } from '@playwright/test';

/**
 * The requests of a few kinds that a page has sent and not yet had answered. It sees only requests
 * sent after it started watching.
 */
export class RequestsInFlight {
    private readonly pending = new Set<Request>();
    private readonly what: string;

    private constructor(what: string) {
        this.what = what;
    }

    /** Starts watching the requests whose URL matches one of `urls`; `what` names them in a failure. */
    public static watch(page: Page, urls: readonly RegExp[], what: string): RequestsInFlight {
        const watched = new RequestsInFlight(what);
        const answered = (request: Request): void => {
            watched.pending.delete(request);
        };

        page.on('request', request => {
            if (urls.some(url => url.test(request.url()))) {
                watched.pending.add(request);
            }
        });
        page.on('requestfinished', answered);
        page.on('requestfailed', answered);

        return watched;
    }

    /** Resolves once every watched request sent so far has been answered or has failed. */
    public async settled(): Promise<void> {
        await expect.poll(() => this.pending.size, { message: `${this.what} still waiting for an answer` }).toBe(0);
    }
}
