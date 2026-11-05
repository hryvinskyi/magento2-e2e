import type { BrowserContext, Page, Response } from '@playwright/test';
import { reportableMessageOf } from './answers';
import type { ShopAnswer, ShopRequestOptions, ShopRequests } from './shop';

/** How long the shop may take to answer the page these requests are sent from. */
const QUIET_PAGE_DEADLINE_MS = 30_000;

/** The address of the quiet page, at the root of an origin. */
const QUIET_PAGE = '/robots.txt';

/** The content type of a page that holds no script. */
const PLAIN_TEXT = /^text\/plain(\s*;|$)/i;

/** What the browser answers a request that was redirected and told not to follow. */
const UNFOLLOWED_REDIRECT_STATUS = 0;

/** What a request sent from the page is given to work with. */
interface PagePost {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly timeout: number;
}

/** A shop's answer, as it leaves the page. */
interface PageAnswer {
    readonly status: number;
    readonly body: string;
}

/** Runs in the page: sends one request and reads its answer, within the deadline, following no redirect. */
async function postFromThePage({ url, headers, body, timeout }: PagePost): Promise<PageAnswer> {
    const answer = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
        body,
        redirect: 'manual',
        credentials: 'same-origin',
        signal: AbortSignal.timeout(timeout),
    });

    return { status: answer.status, body: await answer.text() };
}

/** Why a page's answer is no quiet page of this origin; nothing when it is one. */
function noisyPageReason(answer: Response | null, origin: string): string | undefined {
    if (answer === null) {
        return 'no answer';
    }

    const type = answer.headers()['content-type'] ?? '';

    if (answer.status() !== 200 || !PLAIN_TEXT.test(type)) {
        return `${String(answer.status())} ${type === '' ? 'with no content type' : type}`;
    }

    return new URL(answer.url()).origin === origin ? undefined : `an answer from ${answer.url()}`;
}

/**
 * Sends the shop's REST calls from a page of the browser, so they carry its session with the shop's
 * firewall.
 *
 * The page is `/robots.txt` at the root of the store's origin, not below a store's path, where a shop
 * answers a 404 page with all its scripts: a proof never passes through a page that runs the shop's or a
 * tracker's scripts. A shop that answers anything but plain text there is refused before any proof is
 * sent.
 */
export class BrowserShopRequests implements ShopRequests {
    private readonly page: Page;

    private constructor(page: Page) {
        this.page = page;
    }

    /**
     * Opens the page in `context`, on the origin of `storeUrl`. It throws when that address is not plain
     * text of the same origin, having closed the page again.
     */
    public static async open(context: Pick<BrowserContext, 'newPage'>, storeUrl: string): Promise<BrowserShopRequests> {
        const address = new URL(QUIET_PAGE, storeUrl);
        const page = await context.newPage();

        try {
            const reason = noisyPageReason(await page.goto(address.toString(), { timeout: QUIET_PAGE_DEADLINE_MS }), address.origin);

            if (reason !== undefined) {
                throw new Error(`${address.toString()} answered ${reason}, not the plain text the shop's REST calls are sent from. No proof was sent.`);
            }
        } catch (error) {
            await page.close();

            throw new Error(reportableMessageOf(error));
        }

        return new BrowserShopRequests(page);
    }

    /** Sends one request from the page; a failure, a redirect among them, is a plain error that holds nothing of what was sent. */
    public async post(url: string, { headers, data, timeout }: ShopRequestOptions): Promise<ShopAnswer> {
        let answer: PageAnswer;

        try {
            answer = await this.page.evaluate(postFromThePage, { url, headers, body: JSON.stringify(data), timeout });
        } catch (error) {
            throw new Error(reportableMessageOf(error));
        }

        if (answer.status === UNFOLLOWED_REDIRECT_STATUS) {
            throw new Error(`The shop redirected ${url}, and the redirect was not followed: it would have carried the proof along.`);
        }

        return { status: () => answer.status, text: () => Promise.resolve(answer.body) };
    }

    /** Closes the page. Nothing can be sent after it. */
    public async close(): Promise<void> {
        await this.page.close();
    }
}
