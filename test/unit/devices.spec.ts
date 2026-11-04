import { expect, test } from '@playwright/test';
import { DEFAULT_DEVICES, deviceOptions, devicesOfRun } from '../../src/config/devices';

test('the default browsers are a desktop Chromium and an Android phone that runs the @mobile tests', () => {
    expect(DEFAULT_DEVICES).toEqual([
        { name: 'desktop', device: 'Desktop Chrome', grepInvert: /@mobile-only/ },
        { name: 'mobile', device: 'Pixel 7', grep: /@mobile/ },
    ]);
});

test('E2E_WEBKIT adds Safari\'s engine on a desktop and an iPhone', () => {
    expect(devicesOfRun(undefined, { E2E_WEBKIT: '1' })).toEqual([
        ...DEFAULT_DEVICES,
        { name: 'desktop-safari', device: 'Desktop Safari', grepInvert: /@mobile-only/ },
        { name: 'iphone', device: 'iPhone 13', grep: /@mobile/ },
    ]);
    expect(devicesOfRun(undefined, {})).toBe(DEFAULT_DEVICES);
    expect(devicesOfRun(undefined, { E2E_WEBKIT: ' ' })).toBe(DEFAULT_DEVICES);
});

test('a project\'s own browsers replace the defaults, E2E_WEBKIT or not', () => {
    const own = [{ name: 'tablet', device: 'iPad Mini' }];

    expect(devicesOfRun(own, { E2E_WEBKIT: '1' })).toBe(own);
});

test('a device is Playwright\'s descriptor of that name; an unknown name is refused, naming it', () => {
    expect(deviceOptions('Pixel 7')).toMatchObject({ isMobile: true, defaultBrowserType: 'chromium' });
    expect(() => deviceOptions('Pixel 99')).toThrow('"Pixel 99" is not one of Playwright\'s devices');
    expect(() => deviceOptions('toString')).toThrow('"toString" is not one of Playwright\'s devices');
});
