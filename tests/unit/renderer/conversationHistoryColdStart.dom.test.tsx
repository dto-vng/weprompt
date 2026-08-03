/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The store keeps its state in module-level `let` bindings, so each case has to import
// a fresh copy — otherwise the loaded flag leaks between tests and the cold-start
// scenario cannot be reproduced at all.
const loadSyncModule = async (invoke: () => Promise<unknown>) => {
  vi.resetModules();
  const sub = { on: () => () => {} };
  vi.doMock('@/common', () => ({
    ipcBridge: {
      database: { getUserConversations: { invoke } },
      application: { writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) } },
      conversation: {
        get: { invoke: vi.fn().mockResolvedValue(undefined) },
        responseStream: sub,
        listChanged: sub,
        turnCompleted: sub,
        confirmation: { add: sub, remove: sub },
      },
    },
  }));
  return import('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync');
};

describe('conversation history cold start', () => {
  it('does not report an empty history until a load has settled', async () => {
    // Hold the fetch open: this is the window in which the sidebar used to paint
    // "No chat history" over a history that was about to arrive.
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const mod = await loadSyncModule(() => pending);

    const { result } = renderHook(() => mod.useConversationListSync());

    expect(result.current.conversations).toEqual([]);
    expect(result.current.hasLoadedConversations).toBe(false);

    release([{ id: 'c1', name: 'one', created_at: 1, modified_at: 1, type: 'acp', extra: {} }]);

    await waitFor(() => expect(result.current.hasLoadedConversations).toBe(true));
  });

  it('reports a settled load even when the history is genuinely empty', async () => {
    const mod = await loadSyncModule(() => Promise.resolve([]));
    const { result } = renderHook(() => mod.useConversationListSync());

    await waitFor(() => expect(result.current.hasLoadedConversations).toBe(true));
    expect(result.current.conversations).toEqual([]);
  });

  it('reports a settled load when the fetch fails, so the rail is not left blank', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await loadSyncModule(() => Promise.reject(new Error('ipc down')));
    const { result } = renderHook(() => mod.useConversationListSync());

    await waitFor(() => expect(result.current.hasLoadedConversations).toBe(true));
  });
});
