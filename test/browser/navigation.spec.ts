import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { navigatesThePage } from '../../src/navigation';
import { PageServer } from './page-server';

let shop: PageServer;

test.beforeAll(async () => {
    shop = await PageServer.start({ '/': { body: '<!doctype html><html><body></body></html>', type: 'text/html' } });
});

test.afterAll(async () => {
    await shop.stop();
});

test.describe('a request that navigates the page', () => {
    test('is the page opening an address', async ({ page }) => {
        const opening = page.waitForRequest(shop.url('/'));

        await page.goto(shop.url('/'));

        expect(navigatesThePage(await opening, page)).toBe(true);
    });

    test('is not a frame inside the page, though opening one is a navigation', async ({ page }) => {
        await page.goto(shop.url('/'));

        const opening = page.waitForRequest(shop.url('/inside'));

        await page.evaluate(address => {
            const frame = document.createElement('iframe');

            frame.src = address;
            document.body.append(frame);
        }, '/inside');

        const request = await opening;

        expect(request.isNavigationRequest()).toBe(true);
        expect(navigatesThePage(request, page)).toBe(false);
    });

    test('is not a request Playwright has no frame for yet', async ({ page }) => {
        await page.goto(shop.url('/'));

        const beforeItsFrameExists: Pick<Request, 'isNavigationRequest' | 'frame'> = {
            isNavigationRequest: () => true,
            frame: () => {
                throw new Error('The request is issued before the frame is created.');
            },
        };

        expect(navigatesThePage(beforeItsFrameExists, page)).toBe(false);
    });

    test('is not a fetch from the page', async ({ page }) => {
        await page.goto(shop.url('/'));

        const fetching = page.waitForRequest(shop.url('/data'));

        await page.evaluate(() => {
            void fetch('/data');
        });

        expect(navigatesThePage(await fetching, page)).toBe(false);
    });
});
