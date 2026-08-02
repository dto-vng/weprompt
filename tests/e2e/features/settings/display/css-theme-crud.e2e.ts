import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { goToSettings } from '../../../helpers/navigation';
import { takeScreenshot } from '../../../helpers/screenshots';

function themePresetGroup(page: Page) {
  return page.locator('[role="radiogroup"]').first();
}

function themePresetOptions(page: Page) {
  return themePresetGroup(page).locator('label:has(input[type="radio"])');
}

function themePresetRadios(page: Page) {
  return themePresetGroup(page).locator('input[type="radio"]');
}

async function selectedThemePresetIndex(page: Page): Promise<number> {
  return themePresetRadios(page).evaluateAll((radios) =>
    radios.findIndex((radio) => (radio as HTMLInputElement).checked)
  );
}

async function openAppearanceSettings(page: Page): Promise<void> {
  await goToSettings(page, 'appearance');
  await themePresetOptions(page).first().waitFor({ state: 'visible', timeout: 15_000 });
}

test.describe('CSS theme preset selection', () => {
  test('switches to another preset, exposes checked state, and restores the original', async ({ page }) => {
    await openAppearanceSettings(page);

    const options = themePresetOptions(page);
    const radios = themePresetRadios(page);
    const presetCount = await radios.count();
    expect(presetCount).toBeGreaterThanOrEqual(2);

    const initialIndex = await selectedThemePresetIndex(page);
    expect(initialIndex).toBeGreaterThanOrEqual(0);

    const targetIndex = (initialIndex + 1) % presetCount;
    const initialRadio = radios.nth(initialIndex);
    const targetRadio = radios.nth(targetIndex);

    await takeScreenshot(page, 'css-theme-presets/01-initial.png');

    try {
      await options.nth(targetIndex).click();
      await expect(targetRadio).toBeChecked();
      await expect(initialRadio).not.toBeChecked();
      await takeScreenshot(page, 'css-theme-presets/02-selected.png');
    } finally {
      await options.nth(initialIndex).click();
      await expect(initialRadio).toBeChecked();
      await expect(targetRadio).not.toBeChecked();
    }
  });
});
