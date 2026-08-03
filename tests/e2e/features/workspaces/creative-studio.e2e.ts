/**
 * Creative Studio persistence and fake-provider generation coverage.
 *
 * Run with:
 * AIONUI_E2E_TEST=1 AIONUI_E2E_STUDIO_FAKE=1 E2E_DEV=1 \
 *   bunx playwright test --config playwright.config.ts \
 *   tests/e2e/features/workspaces/creative-studio.e2e.ts
 */
import { expect, test } from '../../fixtures';
import { navigateTo, ROUTES } from '../../helpers';
import path from 'node:path';

const mainProcessOnlySentinels = [
  'STUDIO_SECRET_CREDENTIAL_SENTINEL',
  'https://studio-provider-url-sentinel.invalid/v1',
  'STUDIO_PROVIDER_JOB_SENTINEL',
  'STUDIO_RAW_OUTPUT_BODY_SENTINEL',
  '/private/STUDIO_RAW_OUTPUT_PATH_SENTINEL/provider-output.bin',
];

test.describe('Creative Studio workspace', () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(
    process.env.AIONUI_E2E_TEST !== '1' || process.env.AIONUI_E2E_STUDIO_FAKE !== '1' || process.env.E2E_DEV !== '1',
    'Creative Studio E2E requires both fake-provider flags and an explicit unpackaged dev launch.'
  );

  test('saves a three-scene project and submits a reviewed fake generation explicitly', async ({
    electronApp,
    page,
  }) => {
    const projectName = `Studio E2E ${Date.now()}`;

    await test.step('prove the fake-provider runtime gate is active', async () => {
      const gate = await electronApp.evaluate(({ app }) => ({
        isPackaged: app.isPackaged,
        testMode: process.env.AIONUI_E2E_TEST,
        studioFake: process.env.AIONUI_E2E_STUDIO_FAKE,
        expectedUserDataPath: process.env.AIONUI_E2E_USER_DATA_DIR,
        userDataPath: app.getPath('userData'),
      }));
      expect(gate).toMatchObject({
        isPackaged: false,
        testMode: '1',
        studioFake: '1',
      });
      expect(gate.expectedUserDataPath).toBeTruthy();
      expect(gate.userDataPath).toBe(gate.expectedUserDataPath);

      const systemInfo = await electronApp.evaluate(async () => {
        const port = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
        if (!port) throw new Error('Studio E2E backend port was not published');
        const response = await fetch(`http://127.0.0.1:${port}/api/system/info`);
        if (!response.ok) throw new Error(`Studio E2E system info failed with ${response.status}`);
        const body = (await response.json()) as {
          data?: { cache_dir: string; work_dir: string };
          cache_dir?: string;
          work_dir?: string;
        };
        const data = body.data ?? body;
        return { cacheDir: data.cache_dir, workDir: data.work_dir };
      });
      expect(systemInfo).toEqual({
        cacheDir: path.join(gate.userDataPath, 'config'),
        workDir: path.join(gate.userDataPath, 'aionui'),
      });
    });

    await test.step('create a project through the Studio library', async () => {
      const studioLibrary = page.getByRole('region', { name: 'Creative Studio' });
      const openStudioLibrary = async (attempt = 0): Promise<void> => {
        await navigateTo(page, ROUTES.studio);
        try {
          await expect(studioLibrary).toBeVisible({ timeout: 15_000 });
        } catch (error) {
          if (attempt >= 1) throw error;
          await openStudioLibrary(attempt + 1);
        }
      };
      await openStudioLibrary();

      const createDialog = page.getByRole('dialog', { name: 'Create a Creative Studio project' });
      await studioLibrary.getByRole('button', { name: 'New project' }).click();
      await expect(createDialog).toBeVisible();
      await createDialog.getByLabel('Project name').fill(projectName);
      await createDialog
        .getByLabel('Creative brief')
        .fill('A deterministic E2E story used to verify local Studio persistence and safe job cancellation.');
      await createDialog.getByLabel('Target length in seconds').fill('15');
      await createDialog.getByRole('button', { name: 'Create project' }).click();

      const projectOverview = page.getByRole('region', { name: 'Project overview' });
      try {
        await expect(projectOverview).toBeVisible({ timeout: 15_000 });
      } catch {
        await expect(studioLibrary).toBeVisible();
        await studioLibrary.getByRole('button', { name: projectName }).click();
        await expect(projectOverview).toBeVisible();
      }
      await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
      await expect(page).toHaveURL(/#\/studio\/[A-Za-z0-9_-]+$/);
    });

    await test.step('select and persist the project Video model across renderer reload', async () => {
      if (!(await page.getByRole('region', { name: 'Project overview' }).isVisible())) {
        await page.getByRole('button', { name: projectName }).click();
      }
      await expect(page.getByRole('region', { name: 'Project overview' })).toBeVisible();

      const videoModel = page.getByRole('combobox', { name: 'Video model' });
      await videoModel.click();
      const videoOption = page.locator('.arco-select-option').filter({ hasText: 'weprompt-e2e-video' });
      await expect(videoOption).toBeVisible();
      await videoOption.click();
      await expect(videoModel).toContainText('weprompt-e2e-video');

      const projectUrl = page.url();
      await page.reload({ waitUntil: 'domcontentloaded' });

      await expect(page).toHaveURL(projectUrl);
      await expect(page.getByRole('region', { name: 'Project overview' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Video model' })).toContainText('weprompt-e2e-video');
    });

    await test.step('build three five-second scenes and wait for the selected prompt to save', async () => {
      const addScene = page.getByRole('button', { name: 'Add scene' });
      const sceneSelectors = page.getByRole('button', { name: /^Scene \d+: Untitled scene$/ });
      const addSceneAndWait = async (sceneCount: number) => {
        await addScene.click();
        await expect(sceneSelectors).toHaveCount(sceneCount);
      };
      await addSceneAndWait(1);
      await addSceneAndWait(2);
      await addSceneAndWait(3);
      await expect(page.getByText('Storyboard timing: 15 of 15 seconds')).toBeVisible();
      const storyboard = page.getByRole('region', { name: 'Storyboard' });
      await expect(storyboard.getByText('5 seconds', { exact: true })).toHaveCount(3);
      await expect(addScene).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Increase target to 20 seconds' })).toBeVisible();

      const thirdScene = page.getByRole('button', { name: 'Scene 3: Untitled scene', exact: true });
      await thirdScene.focus();
      await expect(thirdScene).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(thirdScene).toHaveAttribute('aria-current', 'true');

      const moveThirdSceneUp = page.getByRole('button', {
        name: 'Move scene up: Scene 3: Untitled scene',
        exact: true,
      });
      await page.keyboard.press('Tab');
      await expect(moveThirdSceneUp).toBeFocused();
      const focusOutline = await moveThirdSceneUp.evaluate((element) => {
        const style = getComputedStyle(element);
        return { halo: style.boxShadow, style: style.outlineStyle };
      });
      expect(focusOutline.style).toBe('solid');
      expect(focusOutline.halo).not.toBe('none');
      await test.info().attach('creative-studio-keyboard-focus', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Scene 2: Untitled scene', exact: true })).toHaveAttribute(
        'aria-current',
        'true'
      );

      await expect(page.getByLabel('Visual prompt')).toBeVisible();

      const outputType = page.getByLabel('Output type');
      await outputType.click();
      await page
        .locator('.arco-select-option')
        .filter({ hasText: /^Video$/ })
        .click();

      const visualPrompt = page.getByLabel('Visual prompt');
      await visualPrompt.fill('A paper airplane crossing a calm blue studio backdrop.');
      await visualPrompt.blur();
      const sceneInspector = page.getByRole('region', { name: 'Scene direction' });
      await expect(sceneInspector.getByRole('status')).toHaveText('Scene saved');
    });

    await test.step('keep the editor operable at target desktop viewports and with reduced motion', async () => {
      const storyboard = page.getByRole('region', { name: 'Storyboard' });
      const sceneMetadata = storyboard.getByText('5 seconds', { exact: true }).first();
      expect(await sceneMetadata.evaluate((element) => getComputedStyle(element).fontSize)).toBe('12px');

      await page.emulateMedia({ reducedMotion: 'reduce' });
      const firstSceneCard = storyboard.getByRole('listitem').first();
      expect(await firstSceneCard.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');

      const sceneInspector = page.getByRole('region', { name: 'Scene direction' });
      const visualPrompt = page.getByLabel('Visual prompt');
      const previewNextAction = page.getByRole('button', { name: 'Generate this scene' });
      const verifyViewport = async (viewport: { width: number; height: number }) => {
        await electronApp.evaluate(({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()
            .find((candidate) => !candidate.isDestroyed())
            ?.setContentSize(size.width, size.height);
        }, viewport);
        await page.evaluate(() => {
          document.scrollingElement?.scrollTo({ top: 0, left: 0 });
          document.querySelectorAll<HTMLElement>('*').forEach((element) => {
            if (element.scrollTop > 0) element.scrollTop = 0;
          });
        });
        await test.info().attach(`creative-studio-${viewport.width}x${viewport.height}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        await expect(sceneInspector.getByRole('status')).toBeInViewport();
        await expect(visualPrompt).toBeInViewport();
        await expect(previewNextAction).toBeInViewport();
      };
      await verifyViewport({ width: 1280, height: 800 });
      await verifyViewport({ width: 1440, height: 900 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    });

    await test.step('open review without provider submission, then confirm and cancel the queued job', async () => {
      const generateScene = page.getByRole('button', { name: 'Generate scene' });
      await expect(generateScene).toBeEnabled();
      await generateScene.click();

      const reviewDialog = page.getByRole('dialog', { name: 'Review generation' });
      await expect(reviewDialog.getByText('WePrompt Studio E2E')).toBeVisible();
      await expect(reviewDialog.getByText('weprompt-e2e-video')).toBeVisible();
      await expect(reviewDialog.getByText('weprompt_studio_e2e')).toHaveCount(0);
      await expect(reviewDialog.getByText('weprompt-media-gateway-v1')).toHaveCount(0);
      await expect(page.getByText('Queued by provider')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Cancel job' })).toHaveCount(0);

      await reviewDialog.getByRole('button', { name: 'Confirm and generate' }).click();

      await expect(page.getByText('Queued by provider')).toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: 'Cancel job' }).click();
      await expect(page.getByText('Cancelled')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancel job' })).toHaveCount(0);
      const rendererText = await page.locator('body').innerText();
      for (const sentinel of mainProcessOnlySentinels) expect(rendererText).not.toContain(sentinel);
    });
  });
});

test.describe('Creative Studio packaged workspace', () => {
  test.skip(
    process.env.E2E_PACKAGED !== '1' || process.env.AIONUI_E2E_STUDIO_FAKE !== '1',
    'Packaged Studio smoke requires an isolated E2E profile; the packaged runtime still refuses the fake adapter.'
  );

  test('creates and reloads a project without activating the fake provider', async ({ electronApp, page }) => {
    const projectName = `Packaged Studio ${Date.now()}`;
    const gate = await electronApp.evaluate(({ app }) => ({
      isPackaged: app.isPackaged,
      expectedUserDataPath: process.env.AIONUI_E2E_USER_DATA_DIR,
      userDataPath: app.getPath('userData'),
    }));
    expect(gate.isPackaged).toBe(true);
    expect(gate.expectedUserDataPath).toBeTruthy();
    expect(gate.userDataPath).toBe(gate.expectedUserDataPath);

    await navigateTo(page, ROUTES.studio);
    const studioLibrary = page.getByRole('region', { name: 'Creative Studio' });
    await expect(studioLibrary).toBeVisible();
    await studioLibrary.getByRole('button', { name: 'New project' }).click();

    const createDialog = page.getByRole('dialog', { name: 'Create a Creative Studio project' });
    await createDialog.getByLabel('Project name').fill(projectName);
    await createDialog.getByLabel('Creative brief').fill('A packaged-runtime persistence and security smoke.');
    await createDialog.getByLabel('Target length in seconds').fill('5');
    await createDialog.getByRole('button', { name: 'Create project' }).click();

    await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
    await expect(page.getByText('WePrompt Studio E2E')).toHaveCount(0);

    await page.getByRole('button', { name: 'Export assets' }).click();
    const exportDialog = page.getByRole('dialog', { name: 'Export assets' });
    await expect(exportDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(exportDialog).toBeHidden();

    const projectUrl = page.url();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(projectUrl);
    await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
  });
});
