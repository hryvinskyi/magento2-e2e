import { expect, test } from '@playwright/test';
import { setting, storeSettingName, switchSetting } from '../../src/environment/variables';

test('a setting is read trimmed', () => {
    expect(setting({ E2E_NAME: '  value  ' }, 'E2E_NAME')).toBe('value');
});

test('an empty or blank setting reads as unset', () => {
    expect(setting({ E2E_NAME: '' }, 'E2E_NAME')).toBeUndefined();
    expect(setting({ E2E_NAME: ' \t ' }, 'E2E_NAME')).toBeUndefined();
    expect(setting({}, 'E2E_NAME')).toBeUndefined();
});

test('a per-store setting is named after the store code in upper case', () => {
    expect(storeSettingName('BASE_URL', 'fr_be')).toBe('E2E_BASE_URL_FR_BE');
});

test('a switch reads on and off in any case, and its fallback when unset', () => {
    expect(switchSetting({ E2E_SWITCH: ' ON ' }, 'E2E_SWITCH', false)).toBe(true);
    expect(switchSetting({ E2E_SWITCH: 'Off' }, 'E2E_SWITCH', true)).toBe(false);
    expect(switchSetting({}, 'E2E_SWITCH', true)).toBe(true);
    expect(switchSetting({ E2E_SWITCH: ' ' }, 'E2E_SWITCH', false)).toBe(false);
});

test('a switch refuses any other value, quoting it as given', () => {
    expect(() => switchSetting({ E2E_SWITCH: ' yes ' }, 'E2E_SWITCH', true))
        .toThrow('E2E_SWITCH must be "on" or "off"; got " yes ".');
});
