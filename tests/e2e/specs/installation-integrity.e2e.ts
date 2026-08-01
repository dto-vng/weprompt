/**
 * Installation integrity failures happen before the normal app shell is ready,
 * so this spec launches its own Electron instance with a debug startup-failure
 * injection instead of using the shared app fixture.
 */
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'path';
import { pathToFileURL } from 'node:url';

declare global {
  interface Window {
    __installationIntegrityReportCount?: number;
    __lastInstallationIntegrityReportMessage?: string;
    __backendLocalToken?: string;
  }
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
  const existingMainWindow = electronApp.windows().find((win) => !win.url().startsWith('devtools://'));
  if (existingMainWindow) {
    await existingMainWindow.waitForLoadState('domcontentloaded');
    return existingMainWindow;
  }

  const page = await electronApp.waitForEvent('window', { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');
  return page;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveSavedCopyPattern(projectRoot: string): Promise<RegExp> {
  const config = JSON.parse(
    await readFile(path.join(projectRoot, 'packages/desktop/src/common/config/i18n-config.json'), 'utf8')
  ) as { supportedLanguages: string[] };
  const labels = await Promise.all(
    config.supportedLanguages.map(async (language) => {
      const locale = JSON.parse(
        await readFile(
          path.join(projectRoot, `packages/desktop/src/renderer/services/i18n/locales/${language}/common.json`),
          'utf8'
        )
      ) as { backendStartup: { incompleteInstallation: { diagnosticsSent: string } } };
      return locale.backendStartup.incompleteInstallation.diagnosticsSent;
    })
  );
  return new RegExp(`^(?:${labels.map(escapeRegExp).join('|')})$`);
}

test.describe('Installation integrity failure dialog', () => {
  test('shows local diagnostics export and records a saved user report', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const savedCopyPattern = await resolveSavedCopyPattern(projectRoot);
    const exportDir = await mkdtemp(path.join(tmpdir(), 'weprompt-installation-integrity-e2e-'));
    const exportPath = path.join(exportDir, 'diagnostics.json.gz');
    let electronApp: ElectronApplication | undefined;

    try {
      electronApp = await electron.launch({
        args: ['.'],
        cwd: projectRoot,
        env: {
          ...process.env,
          AIONUI_DEBUG_BACKEND_STARTUP_FAILURE: 'backend_incomplete_installation',
          AIONUI_DISABLE_AUTO_UPDATE: '1',
          AIONUI_DISABLE_DEVTOOLS: '1',
          AIONUI_E2E_TEST: '1',
          AIONUI_CDP_PORT: '0',
          NODE_ENV: 'development',
        },
        timeout: 60_000,
      });
      const page = await resolveMainWindow(electronApp);
      await electronApp.evaluate(({ dialog }, destination) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
      }, exportPath);

      await expect(page.getByTestId('installation-integrity-dialog')).toBeVisible();
      await expect(page.getByTestId('installation-integrity-description')).toContainText(/WePrompt/);
      await expect(page.getByTestId('installation-integrity-report')).toBeVisible();
      await expect(page.getByTestId('installation-integrity-download')).toHaveCount(0);

      await page.getByTestId('installation-integrity-report').click();

      const reportButton = page.getByTestId('installation-integrity-report');
      await expect(reportButton).toBeDisabled();
      await expect(reportButton).toHaveText(savedCopyPattern);

      await expect
        .poll(async () => {
          try {
            return (await readFile(exportPath)).byteLength;
          } catch {
            return 0;
          }
        })
        .toBeGreaterThan(0);

      await expect
        .poll(() =>
          page.evaluate(() => ({
            count: window.__installationIntegrityReportCount ?? 0,
            message: window.__lastInstallationIntegrityReportMessage ?? '',
          }))
        )
        .toEqual({
          count: 1,
          message: 'installation-integrity-user-report',
        });
    } finally {
      await electronApp?.close();
      await rm(exportDir, { recursive: true, force: true });
    }
  });

  test('does not expose the backend token after a forced untrusted-document load', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const testDir = await mkdtemp(path.join(tmpdir(), 'weprompt-renderer-policy-e2e-'));
    const untrustedDocumentPath = path.join(testDir, 'untrusted.html');
    const untrustedDocumentUrl = pathToFileURL(untrustedDocumentPath).href;
    const launchEnv = {
      ...process.env,
      AIONUI_DISABLE_AUTO_UPDATE: '1',
      AIONUI_DISABLE_DEVTOOLS: '1',
      AIONUI_E2E_TEST: '1',
      AIONUI_E2E_USER_DATA_DIR: path.join(testDir, 'user-data'),
      AIONUI_CDP_PORT: '0',
      NODE_ENV: 'development',
    };
    delete launchEnv.ELECTRON_RENDERER_URL;
    let electronApp: ElectronApplication | undefined;

    try {
      await writeFile(untrustedDocumentPath, '<!doctype html><title>Untrusted renderer</title>', 'utf8');
      electronApp = await electron.launch({
        args: ['.'],
        cwd: projectRoot,
        env: launchEnv,
        timeout: 60_000,
      });
      const page = await resolveMainWindow(electronApp);
      await page.waitForFunction(() => Boolean(document.querySelector('#root')?.children.length), undefined, {
        timeout: 30_000,
      });

      expect(await page.evaluate(() => Boolean(window.__backendLocalToken))).toBe(true);

      const trustedDocumentUrl = page.url();
      await page.evaluate((targetUrl) => window.location.assign(targetUrl), untrustedDocumentUrl);
      await page.waitForTimeout(500);
      expect(page.url()).toBe(trustedDocumentUrl);
      expect(await page.evaluate(() => Boolean(window.__backendLocalToken))).toBe(true);

      await electronApp.evaluate(async ({ BrowserWindow }, targetUrl) => {
        const activeWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
        if (!activeWindow) throw new Error('No active window available for renderer authorization check');
        await activeWindow.webContents.loadURL(targetUrl);
      }, untrustedDocumentUrl);
      await page.waitForURL(untrustedDocumentUrl);

      expect(await page.evaluate(() => Boolean(window.__backendLocalToken))).toBe(false);
    } finally {
      await electronApp?.close();
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test('blocks a trusted development document from redirecting to another loopback document', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const testDir = await mkdtemp(path.join(tmpdir(), 'weprompt-renderer-redirect-e2e-'));
    let trustedRequestCount = 0;
    let untrustedRequestCount = 0;
    let untrustedDocumentUrl = '';
    const server = createServer((request, response) => {
      if (request.url === '/trusted') {
        trustedRequestCount += 1;
        response.writeHead(302, { Location: untrustedDocumentUrl });
        response.end();
        return;
      }

      untrustedRequestCount += 1;
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><title>Untrusted redirect</title>');
    });
    let electronApp: ElectronApplication | undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address() as AddressInfo;
      const trustedDocumentUrl = `http://127.0.0.1:${address.port}/trusted`;
      untrustedDocumentUrl = `http://127.0.0.1:${address.port}/untrusted`;

      electronApp = await electron.launch({
        args: ['.'],
        cwd: projectRoot,
        env: {
          ...process.env,
          AIONUI_DEBUG_BACKEND_STARTUP_FAILURE: 'backend_incomplete_installation',
          AIONUI_DISABLE_AUTO_UPDATE: '1',
          AIONUI_DISABLE_DEVTOOLS: '1',
          AIONUI_E2E_TEST: '1',
          AIONUI_E2E_USER_DATA_DIR: path.join(testDir, 'user-data'),
          AIONUI_CDP_PORT: '0',
          ELECTRON_RENDERER_URL: trustedDocumentUrl,
          NODE_ENV: 'development',
        },
        timeout: 60_000,
      });
      const page =
        electronApp.windows().find((window) => !window.url().startsWith('devtools://')) ??
        (await electronApp.waitForEvent('window', { timeout: 30_000 }));

      await expect.poll(() => trustedRequestCount).toBeGreaterThan(0);
      await page.waitForTimeout(500);

      expect(untrustedRequestCount).toBe(0);
      expect(page.url()).not.toBe(untrustedDocumentUrl);
    } finally {
      await electronApp?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(testDir, { recursive: true, force: true });
    }
  });
});
