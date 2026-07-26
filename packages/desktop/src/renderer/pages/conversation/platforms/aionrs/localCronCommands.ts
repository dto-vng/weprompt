/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type LocalCronProcessingResult = {
  displayContent?: string;
  systemResponses: string[];
};

/**
 * Finalize a completed assistant message for the local-cron path.
 *
 * Legacy cron command text ([CRON_CREATE] etc.) is left visible as-is, and the
 * model's `<think>` reasoning is now surfaced as distinct grey text by
 * MessageText (via `splitThinkContent`). We therefore no longer strip or replace
 * the assistant message here: the previous strip ran at turn finish and wiped the
 * reasoning that had been shown while streaming. Returning no `displayContent`
 * leaves the accumulated raw content untouched so the renderer can split it.
 */
export async function processLocalCronResponse(
  _conversationId: string,
  _rawContent: string
): Promise<LocalCronProcessingResult> {
  return { systemResponses: [] };
}
