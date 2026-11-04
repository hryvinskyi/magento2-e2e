import type { BrowserContext } from '@playwright/test';

/** Methods that only read. Every other method is a write. */
const READING_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

/**
 * Whether a guarded run lets a request leave the browser: a read may go anywhere, a write only to one
 * of the shop's own `origins`. A socket counts as a write to the origin it opens from.
 */
export function mayLeave(method: string, url: string, origins: ReadonlySet<string>): boolean {
    return READING_METHODS.has(method.toUpperCase()) || origins.has(httpOriginOf(url));
}

/**
 * Keeps every write of the context on the shop's own `origins`. A run that targets production (see
 * `Environment.targetsProduction()`: its environment is the live shop, or a store's host here is a
 * live store's host) may read anything and send data only to the shop: that keeps every payment form,
 * tracker and partner of the shop from receiving a write from a test without naming any of them — an
 * allow-list, so a new partner or a renamed endpoint is refused as well.
 *
 * Every other write is aborted as blocked by the client, and every socket to another origin is closed.
 * Requests a page route answers itself never reach this route; a page route that sends a request on
 * to the network (`route.continue()`) bypasses it, so a page route continues only requests to the shop
 * and hands everything else on with `route.fallback()`. What a service worker sends is never routed,
 * so a guarded context blocks service workers.
 *
 * It guards what the browser sends through this context, and no other context. Playwright's API client (`request`, `page.request`,
 * `context.request`) never passes through routes, so a test's own call through it is not guarded. A
 * route sees only the first URL of a redirect, and a 307 or 308 carries the method and body on to
 * wherever it points.
 */
export async function keepWritesOnTheShop(context: BrowserContext, origins: ReadonlySet<string>): Promise<void> {
    await context.route('**/*', async route => {
        const request = route.request();

        if (mayLeave(request.method(), request.url(), origins)) {
            await route.fallback();

            return;
        }

        await route.abort('blockedbyclient');
    });
    await context.routeWebSocket(url => !origins.has(httpOriginOf(url.toString())), socket => socket.close());
}

/** The origin of a URL as a page sees it; a socket's `ws:`/`wss:` counts as the `http:`/`https:` origin it opens from. */
function httpOriginOf(url: string): string {
    const parsed = new URL(url);

    if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
        parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    }

    return parsed.origin;
}
