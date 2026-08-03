/**
 * One-click feedback – verifies the feedback infrastructure introduced for
 * the inline "一键反馈 >>" error-adjacent links.
 *
 * This focused spec verifies that the main-process
 * `feedback:capture-screenshot` IPC returns PNG bytes. The live
 * error-adjacent button and modal wiring are covered by
 * feedback-butler-diagnose.e2e.ts; local archive export is covered by
 * installation-integrity.e2e.ts.
 */
import { test, expect } from '../fixtures';
import { goToSettings } from '../helpers';

declare global {
  interface Window {
    electronAPI?: {
      captureFeedbackScreenshot?: () => Promise<{ filename: string; data: number[] } | null>;
    };
  }
}

test.describe('One-click feedback infrastructure', () => {
  test('captureFeedbackScreenshot IPC returns PNG bytes', async ({ page }) => {
    await goToSettings(page, 'system');

    const result = await page.evaluate(async () => {
      const capture = window.electronAPI?.captureFeedbackScreenshot;
      if (!capture) return { available: false };
      const shot = await capture();
      if (!shot) return { available: true, captured: false };
      return {
        available: true,
        captured: true,
        filename: shot.filename,
        byteCount: shot.data.length,
        // PNG files start with 0x89 'P' 'N' 'G' — verify the signature so
        // we know we got real image bytes rather than an empty or garbage blob.
        startsWithPngSignature:
          shot.data.length >= 4 &&
          shot.data[0] === 0x89 &&
          shot.data[1] === 0x50 &&
          shot.data[2] === 0x4e &&
          shot.data[3] === 0x47,
      };
    });

    expect(result.available).toBe(true);
    expect(result.captured).toBe(true);
    expect(result.filename).toMatch(/^screenshot-.*\.png$/);
    expect(result.byteCount).toBeGreaterThan(100);
    expect(result.startsWithPngSignature).toBe(true);
  });
});
