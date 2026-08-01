/**
 * Butler diagnose button — the "Ask the Butler" chip next to the feedback
 * pill on conversation error bubbles. Clicking it must jump to the home chat
 * with a diagnosis prompt (containing the error text) pre-filled, mirroring
 * the report modal's "Solve via chat" flow.
 *
 * Uses the ACP E2E stream injector to fabricate an error tip without needing
 * a real broken agent session.
 */
import os from 'os';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import {
  buttonWithText,
  FEEDBACK_PILL_LABELS,
  findAssistantIdForBackend,
  goToGuid,
  modalCloseButton,
} from '../helpers';
import { httpDelete, httpPost } from '../helpers/httpBridge';
import { GUID_INPUT } from '../helpers/selectors';

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';
const ERROR_TEXT = 'E2E fabricated failure: provider exploded (code 500)';

type CreatedConversation = { id: string };

type StreamRegistry = {
  controllers: Record<string, { emitErrorTip: (content: string) => Promise<void> }>;
};

async function ensureRendererReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    { timeout: 30_000 }
  );
}

test('error bubble feedback opens the modal and Butler pre-fills a diagnosis prompt', async ({ page }) => {
  await goToGuid(page);
  await ensureRendererReady(page);
  const assistantId = await findAssistantIdForBackend(page, 'codex', { requireAvailable: true });
  test.skip(!assistantId, 'No available Codex assistant for butler-diagnose test');
  if (!assistantId) return;

  const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
    name: `E2E butler diagnose ${Date.now()}`,
    assistant: { id: assistantId },
    extra: { workspace: os.tmpdir(), custom_workspace: true, session_mode: 'full-access' },
  });
  expect(conversation?.id).toBeTruthy();

  try {
    // Arm the injector for this conversation, then open it.
    await page.evaluate(({ id, key }) => window.sessionStorage.setItem(key, id), {
      id: conversation.id,
      key: ENABLED_CONVERSATION_KEY,
    });
    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/conversation/${conversation.id}`);
    await page.waitForSelector('[data-testid="message-list-scroller"]', { timeout: 30_000 });

    // Fabricate an error tip through the injector.
    await page.waitForFunction(
      (id) =>
        Boolean(
          (window as unknown as { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry }).__AIONUI_E2E_MESSAGE_STREAM__
            ?.controllers[id]
        ),
      conversation.id,
      { timeout: 15_000 }
    );
    await page.evaluate(
      async ({ id, text }) => {
        const registry = (window as unknown as { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
          .__AIONUI_E2E_MESSAGE_STREAM__;
        await registry!.controllers[id].emitErrorTip(text);
      },
      { id: conversation.id, text: ERROR_TEXT }
    );

    // The error bubble should surface both live actions.
    const butlerChip = page.locator('button:has-text("找管家排查"), button:has-text("Ask the Butler")').first();
    const feedbackButton = page.locator(buttonWithText(FEEDBACK_PILL_LABELS)).first();
    await expect(butlerChip).toBeVisible({ timeout: 10_000 });
    await expect(feedbackButton).toBeVisible();

    await feedbackButton.click();
    const modalBody = page.locator('[data-testid="feedback-report-scroll-body"]:visible');
    await expect(modalBody).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="feedback-report-auto-info"]:visible')).toBeVisible();
    await page.locator('.arco-modal-wrapper', { has: modalBody }).locator(modalCloseButton()).first().click();
    await expect(modalBody).toHaveCount(0, { timeout: 5_000 });

    await butlerChip.click();

    // Lands on the home chat with the diagnosis prompt (incl. error text) seeded.
    await page.waitForFunction(() => window.location.hash.startsWith('#/guid'), { timeout: 10_000 });
    const input = page.locator(GUID_INPUT);
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveValue(new RegExp(ERROR_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
      timeout: 10_000,
    });
  } finally {
    await httpDelete(page, `/api/conversations/${encodeURIComponent(conversation.id)}`).catch(() => {});
  }
});
