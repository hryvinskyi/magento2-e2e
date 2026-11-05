import type { BrowserContext } from '@playwright/test';
import type { ShopAnswer, ShopRequestOptions, ShopRequests } from './shop';
/**
 * Sends the shop's REST calls from a page of the browser, so they carry its session with the shop's
 * firewall.
 *
 * The page is `/robots.txt` at the root of the store's origin, not below a store's path, where a shop
 * answers a 404 page with all its scripts: a proof never passes through a page that runs the shop's or a
 * tracker's scripts. A shop that answers anything but plain text there is refused before any proof is
 * sent.
 */
export declare class BrowserShopRequests implements ShopRequests {
    private readonly page;
    private constructor();
    /**
     * Opens the page in `context`, on the origin of `storeUrl`. It throws when that address is not plain
     * text of the same origin, having closed the page again.
     */
    static open(context: Pick<BrowserContext, 'newPage'>, storeUrl: string): Promise<BrowserShopRequests>;
    /** Sends one request from the page; a failure, a redirect among them, is a plain error that holds nothing of what was sent. */
    post(url: string, { headers, data, timeout }: ShopRequestOptions): Promise<ShopAnswer>;
    /** Closes the page. Nothing can be sent after it. */
    close(): Promise<void>;
}
