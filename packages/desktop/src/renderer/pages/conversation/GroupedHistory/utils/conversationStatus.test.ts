/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TConversationRuntimeSummary } from '@/common/config/storage';
import { describe, expect, it } from 'vitest';
import {
  COMPLETION_MARK_DURATION_MS,
  STOPPED_MARK_DURATION_MS,
  isConversationAwaitingApproval,
  resolveConversationStatusMark,
  resolveConversationTerminalMark,
} from './conversationStatus';

const NOW = 1_700_000_000_000;

const runtime = (overrides: Partial<TConversationRuntimeSummary> = {}): TConversationRuntimeSummary => ({
  state: 'idle',
  can_send_message: true,
  has_task: false,
  is_processing: false,
  pending_confirmations: 0,
  turn_id: null,
  ...overrides,
});

const input = (overrides: Partial<Parameters<typeof resolveConversationStatusMark>[0]> = {}) => ({
  runtime: runtime(),
  isGenerating: false,
  now: NOW,
  ...overrides,
});

describe('isConversationAwaitingApproval', () => {
  it('detects the waiting-confirmation runtime state', () => {
    expect(isConversationAwaitingApproval(runtime({ state: 'waiting_confirmation' }))).toBe(true);
  });

  it('detects pending confirmations while runtime is running', () => {
    expect(isConversationAwaitingApproval(runtime({ state: 'running', pending_confirmations: 1 }))).toBe(true);
  });

  it('treats a missing runtime as not awaiting approval', () => {
    expect(isConversationAwaitingApproval(undefined)).toBe(false);
  });
});

describe('resolveConversationTerminalMark', () => {
  it('classifies an error as failed', () => {
    expect(resolveConversationTerminalMark('error')).toBe('failed');
  });

  it('classifies ai_waiting_input as successful completion', () => {
    expect(resolveConversationTerminalMark('ai_waiting_input')).toBe('completed');
  });

  it('does not classify live generation states as terminal', () => {
    expect(resolveConversationTerminalMark('ai_generating')).toBeNull();
    expect(resolveConversationTerminalMark('ai_waiting_confirmation')).toBeNull();
    expect(resolveConversationTerminalMark('initializing')).toBeNull();
  });

  it('classifies stopped as stopped', () => {
    expect(resolveConversationTerminalMark('stopped')).toBe('stopped');
  });

  it('does not classify unknown states as terminal', () => {
    expect(resolveConversationTerminalMark('unknown')).toBeNull();
  });
});

describe('resolveConversationStatusMark', () => {
  it('returns idle when no status is active', () => {
    expect(resolveConversationStatusMark(input())).toBe('idle');
  });

  it('returns running while stream generation is active', () => {
    expect(resolveConversationStatusMark(input({ isGenerating: true }))).toBe('running');
  });

  it('returns running for active runtime states', () => {
    expect(resolveConversationStatusMark(input({ runtime: runtime({ state: 'starting' }) }))).toBe('running');
    expect(resolveConversationStatusMark(input({ runtime: runtime({ state: 'running' }) }))).toBe('running');
    expect(resolveConversationStatusMark(input({ runtime: runtime({ state: 'cancelling' }) }))).toBe('running');
  });

  it('prefers needs_you over every other status', () => {
    expect(
      resolveConversationStatusMark(
        input({
          runtime: runtime({ state: 'waiting_confirmation' }),
          isGenerating: true,
          recentFailureAt: NOW,
          recentStoppedAt: NOW,
          completion: { completedAt: NOW },
        })
      )
    ).toBe('needs_you');
  });

  it('prefers failed over running and terminal records', () => {
    expect(
      resolveConversationStatusMark(
        input({
          recentFailureAt: NOW,
          isGenerating: true,
          recentStoppedAt: NOW,
          completion: { completedAt: NOW },
        })
      )
    ).toBe('failed');
  });

  it('prefers running over terminal records', () => {
    expect(
      resolveConversationStatusMark(
        input({ isGenerating: true, recentStoppedAt: NOW, completion: { completedAt: NOW } })
      )
    ).toBe('running');
  });

  it('keeps an unseen completion done after sixty seconds', () => {
    expect(
      resolveConversationStatusMark(input({ completion: { completedAt: NOW - COMPLETION_MARK_DURATION_MS } }))
    ).toBe('done');
  });

  it('keeps a seen completion done until the original deadline', () => {
    expect(
      resolveConversationStatusMark(
        input({
          completion: {
            completedAt: NOW - COMPLETION_MARK_DURATION_MS + 1,
            seenAt: NOW - 1,
          },
        })
      )
    ).toBe('done');
  });

  it('turns a seen completion idle exactly at the original deadline', () => {
    expect(
      resolveConversationStatusMark(
        input({
          completion: {
            completedAt: NOW - COMPLETION_MARK_DURATION_MS,
            seenAt: NOW,
          },
        })
      )
    ).toBe('done_idle');
  });

  it('shows stopped only inside its transient window', () => {
    expect(resolveConversationStatusMark(input({ recentStoppedAt: NOW }))).toBe('stopped');
    expect(
      resolveConversationStatusMark(input({ recentStoppedAt: NOW - STOPPED_MARK_DURATION_MS }))
    ).toBe('idle');
  });

  it('prefers stopped over completion defensively', () => {
    expect(
      resolveConversationStatusMark(
        input({ recentStoppedAt: NOW, completion: { completedAt: NOW } })
      )
    ).toBe('stopped');
  });

  it('treats a missing runtime as idle', () => {
    expect(resolveConversationStatusMark(input({ runtime: undefined }))).toBe('idle');
  });
});
