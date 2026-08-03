/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { processLocalCronResponse } from '@/renderer/pages/conversation/platforms/aionrs/localCronCommands';

describe('processLocalCronResponse', () => {
  it('leaves the assistant message untouched (no replace) so streamed reasoning is not wiped at finish', async () => {
    // <think> reasoning is now surfaced as grey text by MessageText (splitThinkContent),
    // so this finalize step must NOT strip it and must NOT return a displayContent (which
    // would be merged as a replace:true message and overwrite the reasoning at turn finish).
    const result = await processLocalCronResponse(
      'conversation-1',
      '<think>hidden planning</think>\n[CRON_CREATE]\nname: visible legacy text\n[/CRON_CREATE]'
    );

    expect(result).toEqual({ systemResponses: [] });
    expect(result.displayContent).toBeUndefined();
  });
});
