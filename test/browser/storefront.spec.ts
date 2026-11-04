import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { StorefrontBehaviour } from '../../src/project/project';
import type { Store } from '../../src/project/stores';
import { blockRequests } from '../../src/storefront/blocked-requests';
import { consentCookie } from '../../src/storefront/consent';
import { startFreshGuest } from '../../src/storefront/fresh-guest';
import { blockedHosts, clickInside, dismissOnSight, sessionStorageFlag } from '../../src/storefront/page-guards';
import { Storefront } from '../../src/storefront/storefront';
import { keepWritesOnTheShop } from '../../src/storefront/write-guard';
import { below, PageServer } from './page-server';

const FRENCH: Store = { code: 'fr', path: '/fr/', locale: 'fr-FR' };
const MAIN: Store = { code: 'main', path: '/', locale: 'en-GB' };

const HTML = 'text/html';

/** Released by the page's own loader on the first mouse move after it armed, 600 ms after the page loaded. */
const HELD_BACK = `<!doctype html>
<html><head>
<style>#box { color: rgb(0, 0, 0); }</style>
<link rel="lazy-css" href="/styles/late.css">
</head><body>
<div id="box">box</div>
<script type="lazy">document.body.dataset.ran = 'yes';</script>
<script>
setTimeout(function () {
    document.addEventListener('mousemove', function () {
        document.querySelectorAll('link[rel="lazy-css"]').forEach(function (link) { link.rel = 'stylesheet'; });
        document.querySelectorAll('script[type="lazy"]').forEach(function (held) {
            var script = document.createElement('script');
            script.text = held.text;
            held.replaceWith(script);
        });
    }, { once: true });
}, 600);
</script>
</body></html>`;

const SLOW_STYLESHEET = `<!doctype html>
<html><head><link rel="stylesheet" href="/styles/slow.css"></head>
<body><div id="box">box</div><script type="lazy">document.body.dataset.ran = 'yes';</script></body></html>`;

/** An overlay that opens 200 ms after the page, over the whole page; `closable` gives it a close button. */
function overlayPage(closable: boolean): string {
    const close = closable ? '<button data-test-close onclick="this.parentElement.remove()">Close</button>' : '';

    return `<!doctype html>
<html><body>
<button id="target" onclick="this.textContent = 'clicked'">Click me</button>
<script>
document.addEventListener('keydown', function (event) {
    var overlay = document.querySelector('[data-test-overlay]');
    if (event.key === 'Escape' && overlay) { overlay.remove(); }
});
setTimeout(function () {
    var overlay = document.createElement('div');
    overlay.setAttribute('data-test-overlay', '');
    overlay.style.cssText = 'position: fixed; inset: 0; background: white; z-index: 10;';
    overlay.innerHTML = '${close}';
    document.body.appendChild(overlay);
}, 200);
</script>
</body></html>`;
}

const BLANK = '<!doctype html><html><body><p>shop</p></body></html>';

let shop: PageServer;
let other: PageServer;

test.beforeAll(async () => {
    shop = await PageServer.start({
        '/': { body: BLANK, type: HTML },
        '/fr/': { body: BLANK, type: HTML },
        '/fr/checkout/cart': { body: BLANK, type: HTML },
        '/held-back': { body: HELD_BACK, type: HTML },
        '/slow-stylesheet': { body: SLOW_STYLESHEET, type: HTML },
        '/styles/late.css': { body: '#box { color: rgb(0, 128, 0); }', type: 'text/css', delayMs: 300 },
        '/styles/slow.css': { body: '#box { color: rgb(0, 0, 255); }', type: 'text/css', delayMs: 800 },
        '/overlay': { body: overlayPage(true), type: HTML },
        '/overlay-without-close': { body: overlayPage(false), type: HTML },
    });
    other = await PageServer.start({});
});

test.afterAll(async () => {
    await shop.stop();
    await other.stop();
});

function storefrontOn(page: Page, path: string, behaviour: StorefrontBehaviour = {}, store: Store = MAIN): Storefront {
    return new Storefront(page, store, shop.url(path), behaviour);
}

/** How a request the page sends ends: it reached the network, or the browser refused it. */
async function send(page: Page, url: string, method: string): Promise<'sent' | 'failed'> {
    return page.evaluate(async ({ target, verb }) => {
        try {
            await fetch(target, { method: verb, mode: 'no-cors', body: verb === 'GET' ? null : 'x' });

            return 'sent';
        } catch {
            return 'failed';
        }
    }, { target: url, verb: method });
}

/** What a page's WebSocket to `url` went through, in order, until it closed or a second passed. */
async function socketEvents(page: Page, url: string): Promise<readonly string[]> {
    return page.evaluate(target => new Promise<string[]>(resolve => {
        const events: string[] = [];
        const socket = new WebSocket(target);

        socket.addEventListener('open', () => events.push('open'));
        socket.addEventListener('close', () => {
            events.push('close');
            resolve(events);
        });
        setTimeout(() => { resolve(events); }, 1_000);
    }), url);
}

test.describe('a store view below a path', () => {
    test('resolves paths against its base URL, with or without a leading slash', ({ page }) => {
        const french = storefrontOn(page, '/fr/', {}, FRENCH);

        expect(french.url()).toBe(shop.url('/fr/'));
        expect(french.url('/checkout/cart')).toBe(shop.url('/fr/checkout/cart'));
        expect(french.url('checkout/cart?step=1')).toBe(shop.url('/fr/checkout/cart?step=1'));
        expect(french.store).toBe(FRENCH);
        expect(french.page).toBe(page);
    });

    test('opens a path below its base URL', async ({ page }) => {
        const response = await storefrontOn(page, '/fr/', {}, FRENCH).open('/checkout/cart');

        expect(response?.url()).toBe(shop.url('/fr/checkout/cart'));
        expect(shop.requestsTo('/fr/checkout/cart').length).toBeGreaterThan(0);
    });
});

test.describe('a consent cookie', () => {
    const consent = consentCookie('consent', 'declined');

    test('is on the very first request of a visit', async ({ page }) => {
        const before = shop.requestsTo('/fr/').length;

        await storefrontOn(page, '/fr/', { consent }, FRENCH).open();

        const [first] = shop.requestsTo('/fr/').slice(before);

        expect(first?.cookie).toBe('consent=declined');
    });

    test('is not added twice', async ({ page, context }) => {
        const french = storefrontOn(page, '/fr/', { consent }, FRENCH);

        await french.open();
        await french.open('checkout/cart');

        const cookies = await context.cookies(french.baseUrl);

        expect(cookies.filter(cookie => cookie.name === 'consent')).toHaveLength(1);
    });

    test('leaves a consent the browser already holds as it is', async ({ page, context }) => {
        await context.addCookies([{ name: 'consent', value: 'accepted', url: shop.url('/') }]);
        const before = shop.requestsTo('/').length;

        await storefrontOn(page, '/', { consent }).open();

        expect(shop.requestsTo('/').slice(before)[0]?.cookie).toBe('consent=accepted');
    });
});

test.describe('held-back assets', () => {
    const behaviour: StorefrontBehaviour = {
        deferredAssets: { stylesheets: 'link[rel="lazy-css"]', scripts: 'script[type="lazy"]' },
    };

    test('stylesheets are applied once the page is woken, however late its loader arms', async ({ page }) => {
        const storefront = storefrontOn(page, '/', behaviour);

        await storefront.open('held-back');
        await expect(page.locator('#box')).toHaveCSS('color', 'rgb(0, 0, 0)');

        await storefront.applyDeferredStylesheets();

        expect(await page.locator('#box').evaluate(box => getComputedStyle(box).color)).toBe('rgb(0, 128, 0)');
    });

    test('scripts run once the page is woken', async ({ page }) => {
        const storefront = storefrontOn(page, '/', behaviour);

        await storefront.open('held-back');
        expect(await page.evaluate(() => document.body.dataset.ran)).toBeUndefined();

        await storefront.runDeferredScripts();

        expect(await page.evaluate(() => document.body.dataset.ran)).toBe('yes');
    });

    test('without a selector, stylesheets the page is still loading are waited for', async ({ page }) => {
        const storefront = storefrontOn(page, '/');

        await storefront.open('slow-stylesheet');
        await storefront.applyDeferredStylesheets();

        expect(await page.locator('#box').evaluate(box => getComputedStyle(box).color)).toBe('rgb(0, 0, 255)');
    });

    test('without a selector, there are no scripts to run', async ({ page }) => {
        const storefront = storefrontOn(page, '/');

        await storefront.open('slow-stylesheet');
        await storefront.runDeferredScripts();

        expect(await page.evaluate(() => document.body.dataset.ran)).toBeUndefined();
    });
});

test.describe('page guards', () => {
    test('a blocked host never receives a request of the page', async ({ page }) => {
        await blockedHosts(below(other.origin)).install(page);
        await storefrontOn(page, '/').open();

        expect(await send(page, other.url('/blocked-pixel'), 'GET')).toBe('failed');
        expect(await send(page, shop.url('/allowed-pixel'), 'GET')).toBe('sent');
        expect(other.requestsTo('/blocked-pixel')).toHaveLength(0);
        expect(shop.requestsTo('/allowed-pixel')).toHaveLength(1);
    });

    test('a session-storage flag is readable by the page\'s scripts', async ({ page }) => {
        await sessionStorageFlag('overlay.answered', '1').install(page);
        await storefrontOn(page, '/').open();

        expect(await page.evaluate(() => window.sessionStorage.getItem('overlay.answered'))).toBe('1');
    });

    test('a session-storage flag leaves a document without storage without an error', async ({ page }) => {
        const errors: Error[] = [];

        page.on('pageerror', error => errors.push(error));
        await sessionStorageFlag('overlay.answered', '1').install(page);
        await page.goto('data:text/html,<p>no storage here</p>');

        expect(errors).toEqual([]);
    });

    test('an overlay that opens over a button is dismissed with its close button, and the click lands', async ({ page }) => {
        await dismissOnSight('[data-test-overlay]', clickInside('[data-test-close]')).install(page);
        await storefrontOn(page, '/').open('overlay');
        await page.waitForFunction(() => document.querySelector('[data-test-overlay]') !== null);

        await page.locator('#target').click();

        await expect(page.locator('#target')).toHaveText('clicked');
        expect(await page.evaluate(() => document.querySelector('[data-test-overlay]'))).toBeNull();
    });

    test('an overlay without the control is dismissed with Escape, and the click lands', async ({ page }) => {
        await dismissOnSight('[data-test-overlay]', clickInside('[data-test-close]')).install(page);
        await storefrontOn(page, '/').open('overlay-without-close');
        await page.waitForFunction(() => document.querySelector('[data-test-overlay]') !== null);

        await page.locator('#target').click();

        await expect(page.locator('#target')).toHaveText('clicked');
    });
});

test.describe('blocked requests', () => {
    test('never leave any page of the context; other requests do', async ({ page, context }) => {
        await blockRequests(context, [/\/blocked-beacon$/]);
        await storefrontOn(page, '/').open();

        expect(await send(page, other.url('/blocked-beacon'), 'GET')).toBe('failed');
        expect(await send(page, other.url('/open-beacon'), 'GET')).toBe('sent');
        expect(other.requestsTo('/blocked-beacon')).toHaveLength(0);
        expect(other.requestsTo('/open-beacon')).toHaveLength(1);
    });

    test('run after a page route for the same request', async ({ page, context }) => {
        const seenByThePage: string[] = [];

        await blockRequests(context, [/\/counted-beacon$/]);
        await page.route(/\/counted-beacon$/, async route => {
            seenByThePage.push(route.request().url());
            await route.fallback();
        });
        await storefrontOn(page, '/').open();

        expect(await send(page, other.url('/counted-beacon'), 'GET')).toBe('failed');
        expect(seenByThePage).toEqual([other.url('/counted-beacon')]);
        expect(other.requestsTo('/counted-beacon')).toHaveLength(0);
    });
});

test.describe('writes kept on the shop', () => {
    test.beforeEach(async ({ page, context }) => {
        await keepWritesOnTheShop(context, new Set([shop.origin]));
        await storefrontOn(page, '/').open();
    });

    test('a write to another origin is refused before it leaves', async ({ page }) => {
        expect(await send(page, other.url('/charge'), 'POST')).toBe('failed');
        expect(other.requestsTo('/charge')).toHaveLength(0);
    });

    test('a write to the shop arrives', async ({ page }) => {
        expect(await send(page, shop.url('/checkout/update'), 'POST')).toBe('sent');
        expect(shop.requestsTo('/checkout/update').map(request => request.method)).toEqual(['POST']);
    });

    test('a read from another origin arrives', async ({ page }) => {
        expect(await send(page, other.url('/script.js'), 'GET')).toBe('sent');
        expect(other.requestsTo('/script.js')).toHaveLength(1);
    });

    test('a socket to another origin is closed and never reaches it; one to the shop opens', async ({ page }) => {
        const foreign = await socketEvents(page, `${other.origin.replace(/^http/, 'ws')}/events`);
        const own = await socketEvents(page, `${shop.origin.replace(/^http/, 'ws')}/events`);

        expect(foreign).toContain('close');
        expect(other.upgrades).toEqual([]);
        expect(own).toEqual(['open']);
        expect(shop.upgrades).toContain('/events');
    });
});

test.describe('a fresh guest', () => {
    test('has none of the old session: no cookie, no storage, consent recorded again', async ({ page, context }) => {
        const storefront = storefrontOn(page, '/', { consent: consentCookie('consent', 'declined') });

        await storefront.open();
        await context.addCookies([{ name: 'session', value: 'old', url: shop.url('/') }]);
        await page.evaluate(() => {
            window.localStorage.setItem('cart', 'three items');
            window.sessionStorage.setItem('step', 'shipping');
        });

        await startFreshGuest(storefront);

        const cookies = await context.cookies(shop.url('/'));

        expect(cookies.map(cookie => `${cookie.name}=${cookie.value}`)).toEqual(['consent=declined']);
        expect(await page.evaluate(() => [window.localStorage.length, window.sessionStorage.length])).toEqual([0, 0]);
        expect(page.url()).toBe(shop.url('/'));
    });
});
