import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '../../fixtures';

const CONVERSATION_ID = '2be7b8fc-6af5-42b8-aed5-03644735c730';
const FILE_INPUT_TEST_ID = 'presentation-source-native-drop-input';

test.describe('Presentation source native drop boundary', () => {
  test('passes a disk-backed File to main and rejects a synthetic File in preload', async ({ page }) => {
    const sandbox = await mkdtemp(join(tmpdir(), 'weprompt-presentation-drop-e2e-'));
    const sourcePath = join(sandbox, 'source.pdf');
    await writeFile(sourcePath, '%PDF-1.7\n%%EOF\n', { encoding: 'utf8' });

    try {
      await page.evaluate((testId) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.dataset.testid = testId;
        input.hidden = true;
        document.body.append(input);
      }, FILE_INPUT_TEST_ID);
      await page.getByTestId(FILE_INPUT_TEST_ID).setInputFiles(sourcePath);

      const nativeResult = await page.evaluate(
        async ({ conversationId, testId }) => {
          const input = document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
          const nativeFile = input?.files?.[0];
          const presentationSources = window.electronAPI?.presentationSources;
          if (!nativeFile || !presentationSources) {
            throw new Error('Presentation source native-drop boundary is unavailable.');
          }

          return presentationSources.grantExternalDrop({
            owner: { owner_type: 'conversation', conversation_id: conversationId },
            files: [nativeFile],
            expected_owner_revision: 0,
          });
        },
        { conversationId: CONVERSATION_ID, testId: FILE_INPUT_TEST_ID }
      );

      expect(nativeResult).toMatchObject({ ok: false, code: 'FEATURE_DISABLED' });
      expect(JSON.stringify(nativeResult)).not.toContain(sourcePath);

      const syntheticResult = await page.evaluate(async (conversationId) => {
        const presentationSources = window.electronAPI?.presentationSources;
        if (!presentationSources) {
          throw new Error('Presentation source native-drop boundary is unavailable.');
        }

        return presentationSources.grantExternalDrop({
          owner: { owner_type: 'conversation', conversation_id: conversationId },
          files: [new File(['synthetic'], 'synthetic.pdf', { type: 'application/pdf' })],
          expected_owner_revision: 0,
        });
      }, CONVERSATION_ID);

      expect(syntheticResult).toMatchObject({ ok: false, code: 'NATIVE_FILE_REQUIRED' });
    } finally {
      await page
        .getByTestId(FILE_INPUT_TEST_ID)
        .evaluate((input) => input.remove())
        .catch(() => {});
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});
