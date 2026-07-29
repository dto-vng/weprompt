/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  activeId: 'conversation-1' as string | undefined,
  activeCompletion: undefined as { completedAt: number; seenAt?: number } | undefined,
  markCompletionSeen: vi.fn(),
  refreshConversationRuntime: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: harness.activeId }),
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => ({
    conversations: [],
    isConversationGenerating: vi.fn(),
    getRecentCompletionAt: vi.fn(),
    getCompletion: () => harness.activeCompletion,
    getRecentStoppedAt: vi.fn(),
    getRecentFailureAt: vi.fn(),
    markCompletionSeen: harness.markCompletionSeen,
    refreshConversationRuntime: harness.refreshConversationRuntime,
    groupedHistory: {
      pinnedConversations: [],
      timelineSections: [],
    },
  }),
}));

import { useConversations } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversations';

describe('useConversations completion state', () => {
  beforeEach(() => {
    harness.activeId = 'conversation-1';
    harness.activeCompletion = undefined;
    harness.markCompletionSeen.mockReset();
    harness.refreshConversationRuntime.mockReset();
  });

  it('marks an unseen completion seen when its route is active', () => {
    harness.activeCompletion = { completedAt: 1_000 };
    renderHook(() => useConversations());

    expect(harness.markCompletionSeen).toHaveBeenCalledWith('conversation-1');
  });

  it('marks a completion seen when it arrives for an already active route', () => {
    const rendered = renderHook(() => useConversations());
    expect(harness.markCompletionSeen).not.toHaveBeenCalled();

    harness.activeCompletion = { completedAt: 2_000 };
    rendered.rerender();

    expect(harness.markCompletionSeen).toHaveBeenCalledWith('conversation-1');
  });

  it('does not mark an already seen completion again', () => {
    harness.activeCompletion = { completedAt: 1_000, seenAt: 1_500 };
    renderHook(() => useConversations());

    expect(harness.markCompletionSeen).not.toHaveBeenCalled();
  });
});
