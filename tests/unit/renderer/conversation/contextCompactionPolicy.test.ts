/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationTurnCompletedEvent } from '@/common/ipcBridge';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({ ipcBridge: {} }));

import {
  isMeaningfulContextTurn,
  shouldAutoCompactContext,
} from '@/renderer/pages/conversation/contextHandoff/useContextCompaction';

/**
 * Captured from the running backend over the WebSocket, not hand-written from the type.
 * The distinction matters: `IConversationTurnCompletedEvent` declares a `state` field,
 * the wire does not carry one, and a fixture built from the type would have hidden
 * exactly the bug these tests exist for.
 */
const WIRE_TURN = {
  session_id: '8f165203',
  turn_id: 'turn_16ae7af6',
  status: 'finished',
  can_send_message: true,
  runtime: {
    state: 'idle',
    can_send_message: true,
    has_task: true,
    task_status: 'finished',
    is_processing: false,
    pending_confirmations: 0,
    turn_id: null,
  },
} as unknown as IConversationTurnCompletedEvent;

const FINISHED_STREAM = { terminal: 'finish' as const, hasMeaningfulAssistantText: true };

const withRuntime = (patch: Record<string, unknown>): IConversationTurnCompletedEvent =>
  ({
    ...WIRE_TURN,
    runtime: { ...(WIRE_TURN.runtime as object), ...patch },
  }) as unknown as IConversationTurnCompletedEvent;

describe('isMeaningfulContextTurn', () => {
  it('counts a finished turn from a backend that sends no top-level state', () => {
    // The regression: this returned false for every real turn, so turns_since_compaction
    // never incremented and auto-compaction could not fire on any trigger.
    expect(isMeaningfulContextTurn(WIRE_TURN, FINISHED_STREAM)).toBe(true);
  });

  it('still counts the explicit ai_waiting_input shape', () => {
    const explicit = { ...WIRE_TURN, state: 'ai_waiting_input' } as unknown as IConversationTurnCompletedEvent;

    expect(isMeaningfulContextTurn(explicit, FINISHED_STREAM)).toBe(true);
  });

  it('rejects a turn whose backend reports a state other than ai_waiting_input', () => {
    const busy = { ...WIRE_TURN, state: 'ai_running' } as unknown as IConversationTurnCompletedEvent;

    expect(isMeaningfulContextTurn(busy, FINISHED_STREAM)).toBe(false);
  });

  it.each([
    ['still processing', { is_processing: true }],
    ['composer still locked', { can_send_message: false }],
    ['awaiting a confirmation', { pending_confirmations: 1 }],
  ])('rejects a turn that has not settled: %s', (_case, patch) => {
    expect(isMeaningfulContextTurn(withRuntime(patch), FINISHED_STREAM)).toBe(false);
  });

  it('rejects a turn that did not finish', () => {
    const aborted = { ...WIRE_TURN, status: 'aborted' } as unknown as IConversationTurnCompletedEvent;

    expect(isMeaningfulContextTurn(aborted, FINISHED_STREAM)).toBe(false);
  });

  it('rejects an errored stream and a turn with no assistant text', () => {
    expect(isMeaningfulContextTurn(WIRE_TURN, { terminal: 'error', hasMeaningfulAssistantText: true })).toBe(false);
    expect(isMeaningfulContextTurn(WIRE_TURN, { terminal: 'finish', hasMeaningfulAssistantText: false })).toBe(false);
  });
});

describe('shouldAutoCompactContext', () => {
  const base = { hasContext: true, previousBudgetStatus: 'healthy' as const, nextBudgetStatus: 'healthy' as const };

  it('fires on the eighth turn since the last compaction, not the seventh', () => {
    expect(shouldAutoCompactContext({ ...base, turnsSinceCompaction: 7 })).toBe(false);
    expect(shouldAutoCompactContext({ ...base, turnsSinceCompaction: 8 })).toBe(true);
  });

  it('fires when the budget escalates into watch or beyond', () => {
    expect(shouldAutoCompactContext({ ...base, turnsSinceCompaction: 1, nextBudgetStatus: 'watch' })).toBe(true);
  });

  it('does not re-fire while the budget stays in the same band', () => {
    expect(
      shouldAutoCompactContext({
        ...base,
        turnsSinceCompaction: 1,
        previousBudgetStatus: 'compress',
        nextBudgetStatus: 'compress',
      })
    ).toBe(false);
  });
});
