/**
 * Feedback regression scenarios for the custom-agent editor.
 *
 * Covered scenarios:
 *   5. Agent test connection (CLI not found) → alert has NO feedback pill
 *   6. Agent test connection (CLI exists, ACP fails) → alert has NO feedback pill
 *      (the pill was removed from InlineAgentEditor in #3448; the unit test
 *      feedbackMountPoints.test.ts asserts the same at source level)
 *
 * Live modal wiring is covered through the conversation-error surface in
 * feedback-butler-diagnose.e2e.ts. Other mount points are verified with focused
 * component/source tests because reproducing their native/runtime failures is
 * not stable E2E setup:
 *   - MessageTips error (needs live model)
 *   - MessageToolGroup error (needs live tool call)
 *   - MessageAgentStatus error (needs broken agent session)
 *   - MCP server connection error
 *   - System settings directory-change error
 */
import { test, expect, type Page } from '../fixtures';
import {
  BTN_ADD_CUSTOM_AGENT,
  BTN_ADD_CUSTOM_AGENT_MANUAL,
  buttonWithText,
  FEEDBACK_PILL_LABELS,
  goToSettings,
  modalCloseButton,
  TEST_CONNECTION_LABELS,
} from '../helpers';

// FeedbackButton renders settings.oneClickFeedback as button text (no aria-label),
// so match the text in whichever language the app is running.
const FEEDBACK_PILL = buttonWithText(FEEDBACK_PILL_LABELS);

/** Close every visible AionModal and require its backdrop to stop intercepting input. */
async function closeVisibleModals(page: Page) {
  for (let i = 0; i < 3; i++) {
    const visibleModal = page.locator('.arco-modal-wrapper:visible').first();
    if (!(await visibleModal.isVisible().catch(() => false))) break;
    const closeBtn = visibleModal.locator(modalCloseButton()).first();
    await expect(closeBtn).toBeVisible({ timeout: 2_000 });
    await closeBtn.click({ timeout: 2_000 });
    await expect(visibleModal).toBeHidden({ timeout: 5_000 });
  }
}

// Tests share one Electron instance across spec files; a modal left open by a
// prior (possibly failed) test intercepts pointer events and poisons every test
// after it. Clean both sides of each scenario so later spec files start clean.
test.beforeEach(async ({ page }) => closeVisibleModals(page));
test.afterEach(async ({ page }) => closeVisibleModals(page));

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 (MCP error → mcp-tools) is covered by the component-level test
// tests/unit/feedback/McpServerHeaderFeedback.dom.test.tsx — it renders
// McpServerHeader with status='error' and asserts the feedback pill opens
// the modal with module=mcp-tools. Driving a real MCP connection failure
// via the UI proved too brittle (locale-dependent button labels, manual-add
// vs JSON-import dropdown, auto-test timing). The component test gives
// equivalent coverage of the regression-surface.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 (System settings form error) is covered by the static mount-point
// test in tests/unit/feedback/feedbackMountPoints.test.ts — the UI path to
// trigger the error requires mocking Electron's native dialog AND cancelling
// an Arco confirm modal, which is too brittle for a stable E2E. The white-box
// source assertion verifies the module tag stays correct on refactor.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Helper: open the inline custom-agent editor and fill the command field
// ─────────────────────────────────────────────────────────────────────────────

async function openCustomAgentEditor(page: Page, command: string) {
  // Defensive: close any AionModal left over from a prior test so the
  // sidebar/page buttons are clickable.
  await closeVisibleModals(page);

  await goToSettings(page, 'agent');

  // The "Add custom Agent" entry is a TalkToButlerButton dropdown; open it and
  // choose "Add manually" to mount the inline editor modal.
  const addButton = page.locator(BTN_ADD_CUSTOM_AGENT).first();
  await expect(addButton).toBeVisible({ timeout: 10_000 });
  await addButton.click();
  const manualItem = page.locator(BTN_ADD_CUSTOM_AGENT_MANUAL).first();
  await expect(manualItem).toBeVisible({ timeout: 5_000 });
  await manualItem.click();

  // Scope everything to the editor modal — the agent cards behind it carry
  // test-connection buttons too, which the modal backdrop makes unclickable.
  const editorModal = page.locator('.arco-modal-wrapper', {
    has: page.locator('input[placeholder*="my-agent"]'),
  });

  // Fill the command input — target it by its placeholder (settings.commandPlaceholder)
  // so index shifts in the form don't silently fill the wrong field.
  const commandInput = editorModal.locator('input[placeholder*="my-agent"]').first();
  await expect(commandInput).toBeVisible({ timeout: 5_000 });
  await commandInput.fill(command);

  // Click "Test Connection"
  const testBtn = editorModal.locator(buttonWithText(TEST_CONNECTION_LABELS)).first();
  await testBtn.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Agent test connection — fail_cli → agent-detection
// ─────────────────────────────────────────────────────────────────────────────

test('[5] Agent fail_cli alert shows without feedback pill', async ({ page }) => {
  await openCustomAgentEditor(page, 'aionui-e2e-missing-binary-xyz');

  // Expect the fail_cli alert to appear — without the feedback pill, which
  // was deliberately removed from InlineAgentEditor (#3448).
  const alert = page.locator('.arco-alert-error').first();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert.locator(FEEDBACK_PILL)).toHaveCount(0);

  // Close the agent editor modal so the next test starts fresh.
  await closeVisibleModals(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Agent test connection — fail_acp → agent-detection
// ─────────────────────────────────────────────────────────────────────────────

test('[6] Agent fail_acp warning shows without feedback pill', async ({ page }) => {
  await openCustomAgentEditor(page, '/bin/echo');

  // Expect the fail_acp warning alert (warning, not error) — also without
  // the feedback pill (#3448).
  const alert = page.locator('.arco-alert-warning').first();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert.locator(FEEDBACK_PILL)).toHaveCount(0);

  await closeVisibleModals(page);
});
