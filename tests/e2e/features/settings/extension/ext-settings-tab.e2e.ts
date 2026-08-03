/**
 * Extension Settings Tab — iframe rendering, content verification, keep-alive.
 *
 * Supplements specs/ext-settings-tabs.e2e.ts (tab discovery, position anchoring,
 * basic navigation). This file focuses on:
 *   1. Page-route entry and hash verification
 *   2. Iframe renders meaningful content (not just existence)
 *   3. Tab switch round-trip: switch away then back, content survives
 */
import type { Page } from '@playwright/test';
import type { ElectronApplication } from 'playwright';
import { test, expect } from '../../../fixtures';
import { goToSettings, goToExtensionSettings, waitForSettle, settingsSiderItemById } from '../../../helpers';

const KNOWN_TAB_IDS = ['ext-e2e-full-extension-e2e-settings', 'ext-hello-world-hello-settings'] as const;
type KnownTabId = (typeof KNOWN_TAB_IDS)[number];

const KNOWN_TAB_CONTENT: Record<KnownTabId, { selector: string; text?: string; srcSuffix: string }> = {
  'ext-e2e-full-extension-e2e-settings': {
    selector: '#endpoint[placeholder="http://localhost:19999"]',
    srcSuffix: '/settings/e2e-settings.html',
  },
  'ext-hello-world-hello-settings': {
    selector: 'code',
    text: 'Ocean Breeze',
    srcSuffix: '/settings/hello-settings.html',
  },
};

const IFRAME_SEL = 'iframe[title*="Extension settings"]';

async function countTabsPresent(page: Page): Promise<number[]> {
  return Promise.all(KNOWN_TAB_IDS.map((id) => page.locator(settingsSiderItemById(id)).count()));
}

async function waitForAnyExtTab(page: Page, timeout = 10_000): Promise<string | null> {
  try {
    await expect
      .poll(async () => (await countTabsPresent(page)).some((c) => c > 0), {
        timeout,
        message: 'Waiting for at least one extension settings tab',
      })
      .toBeTruthy();
  } catch {
    return null;
  }
  const counts = await countTabsPresent(page);
  const idx = counts.findIndex((c) => c > 0);
  return idx >= 0 ? KNOWN_TAB_IDS[idx] : null;
}

async function waitForIframeLoaded(page: Page, timeoutMs = 15_000): Promise<void> {
  const iframe = page.locator(IFRAME_SEL);
  await expect
    .poll(async () => Number(await iframe.first().evaluate((el) => getComputedStyle(el).opacity)), {
      timeout: timeoutMs,
    })
    .toBe(1);
}

async function readKnownWebviewContent(
  electronApp: ElectronApplication,
  expected: { selector: string; srcSuffix: string }
): Promise<{ found: boolean; text: string; url: string } | null> {
  return electronApp.evaluate(async ({ webContents }, expectedContent) => {
    const guest = webContents.getAllWebContents().find((contents) => {
      if (contents.getType() !== 'webview') return false;
      try {
        return new URL(contents.getURL()).pathname.endsWith(expectedContent.srcSuffix);
      } catch {
        return false;
      }
    });
    if (!guest) return null;

    const selector = JSON.stringify(expectedContent.selector);
    const content = (await guest.executeJavaScript(
      `(() => {
        const element = document.querySelector(${selector});
        return { found: Boolean(element), text: element?.textContent?.trim() ?? '' };
      })()`
    )) as { found: boolean; text: string };
    return { ...content, url: guest.getURL() };
  }, expected);
}

test.describe('Extension: Page-Route Entry', () => {
  test('page route sets correct hash', async ({ page }) => {
    await goToSettings(page, 'profile');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toContain(`/settings/ext/${tabId}`);
  });

  test('sider highlights the active extension tab', async ({ page }) => {
    await goToSettings(page, 'profile');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const siderItem = page.locator(settingsSiderItemById(tabId!));
    await expect(siderItem).toBeVisible({ timeout: 5_000 });
    await expect(siderItem).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('Extension: Iframe Content Rendering', () => {
  test('renders the known local fixture with its expected content', async ({ electronApp, page }) => {
    await goToSettings(page, 'profile');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const iframe = page.locator(IFRAME_SEL);
    const webview = page.locator('webview');
    const expected = KNOWN_TAB_CONTENT[tabId as KnownTabId];
    await expect
      .poll(async () => (await iframe.count()) + (await webview.count()), {
        message: 'Waiting for exactly one extension settings host',
      })
      .toBe(1);
    const iframeCount = await iframe.count();
    const webviewCount = await webview.count();

    const host = iframeCount === 1 ? iframe : webview;
    const src = await host.getAttribute('src');
    expect(src).toMatch(/^https?:\/\/|^file:/);
    expect(new URL(src!).pathname.endsWith(expected.srcSuffix)).toBe(true);
    await expect(host).toBeVisible();
    const hostSurface = await host.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const centerElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        height: rect.height,
        topmost: centerElement === element || (centerElement !== null && element.contains(centerElement)),
        width: rect.width,
      };
    });
    expect(hostSurface.width).toBeGreaterThan(0);
    expect(hostSurface.height).toBeGreaterThan(0);
    expect(hostSurface.topmost).toBe(true);

    if (iframeCount === 1) {
      await waitForIframeLoaded(page);
      const content = page.frameLocator(IFRAME_SEL).locator(expected.selector);
      await expect(content.first()).toBeVisible();
      if (expected.text) await expect(content.first()).toHaveText(expected.text);
      return;
    }

    await expect
      .poll(() => readKnownWebviewContent(electronApp, expected), {
        message: 'Waiting for the known extension fixture content in its webview guest',
      })
      .toMatchObject({ found: true });
    const guestContent = await readKnownWebviewContent(electronApp, expected);
    expect(new URL(guestContent!.url).pathname.endsWith(expected.srcSuffix)).toBe(true);
    if (expected.text) expect(guestContent!.text).toBe(expected.text);
  });

  test('iframe becomes fully visible after load', async ({ page }) => {
    await goToSettings(page, 'profile');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    test.skip((await page.locator(IFRAME_SEL).count()) === 0, 'External webview tab');

    await waitForIframeLoaded(page);
  });

  test('iframe has sandbox attributes for local tabs', async ({ page }) => {
    await goToSettings(page, 'profile');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const iframe = page.locator(IFRAME_SEL);
    test.skip((await iframe.count()) === 0, 'No iframe found');

    const sandbox = await iframe.first().getAttribute('sandbox');
    expect(sandbox).toContain('allow-scripts');
  });
});

test.describe('Extension: Tab Switch Round-Trip', () => {
  test('switch to builtin tab and back preserves extension content', async ({ page }) => {
    await goToSettings(page, 'profile');
    const tabId = await waitForAnyExtTab(page);
    test.skip(!tabId, 'No extension tabs installed');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    const iframe = page.locator(IFRAME_SEL);
    const hasIframe = (await iframe.count()) > 0;
    let initialSrc: string | null = null;
    if (hasIframe) {
      await waitForIframeLoaded(page);
      initialSrc = await iframe.first().getAttribute('src');
    }

    await goToSettings(page, 'system');
    await waitForSettle(page);
    expect(await page.evaluate(() => window.location.hash)).toContain('/settings/system');

    await goToExtensionSettings(page, tabId!);
    await waitForSettle(page);

    if (hasIframe) {
      const returned = page.locator(IFRAME_SEL);
      await expect(returned.first()).toBeVisible({ timeout: 10_000 });
      expect(await returned.first().getAttribute('src')).toBe(initialSrc);
    }
  });

  test('switch between two extension tabs loads each correctly', async ({ page }) => {
    await goToSettings(page, 'profile');

    let ids: string[] = [];
    try {
      await expect
        .poll(
          async () => {
            const counts = await countTabsPresent(page);
            ids = KNOWN_TAB_IDS.filter((_, i) => counts[i] > 0);
            return ids.length;
          },
          { timeout: 10_000, message: 'Waiting for multiple extension tabs' }
        )
        .toBeGreaterThanOrEqual(2);
    } catch {
      /* not enough tabs in this environment */
    }

    test.skip(ids.length < 2, 'Need at least 2 extension tabs installed');

    await goToExtensionSettings(page, ids[0]);
    await waitForSettle(page);
    expect(await page.evaluate(() => window.location.hash)).toContain(`/settings/ext/${ids[0]}`);

    await goToExtensionSettings(page, ids[1]);
    await waitForSettle(page);
    expect(await page.evaluate(() => window.location.hash)).toContain(`/settings/ext/${ids[1]}`);
  });
});
