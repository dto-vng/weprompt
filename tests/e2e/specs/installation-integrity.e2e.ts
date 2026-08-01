/**
 * Installation integrity failures happen before the normal app shell is ready,
 * so this spec launches its own Electron instance with a debug startup-failure
 * injection instead of using the shared app fixture.
 */
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

declare global {
  interface Window {
    __installationIntegrityReportCount?: number;
    __lastInstallationIntegrityReportMessage?: string;
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
});
