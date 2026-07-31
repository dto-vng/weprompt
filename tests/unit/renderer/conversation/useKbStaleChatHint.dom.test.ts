/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_KNOWLEDGE_NAME } from '@/common/knowledge/constants';
import { kbStaleHintDismissKey, useKbStaleChatHint } from '@/renderer/pages/conversation/knowledge/useKbStaleChatHint';

const listSourcesMock = vi.fn();
let updatedListener: ((payload: { projectId: string }) => void) | null = null;
const unsubscribeMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    projectKnowledge: {
      listSources: { invoke: (...args: unknown[]) => listSourcesMock(...args) },
      updated: {
        on: (listener: (payload: { projectId: string }) => void) => {
          updatedListener = listener;
          return unsubscribeMock;
        },
      },
    },
  },
}));

const source = (over: Partial<{ status: string; chunkCount: number }> = {}) => ({
  id: 's1',
  fileName: 'policy.pdf',
  byteSize: 10,
  status: 'ready',
  chunkCount: 4,
  vectorCount: 0,
  addedAt: 0,
  error: null,
  progress: null,
  ocr: null,
  ...over,
});

const listResult = (sources: unknown[]) => ({ sources, summary: null, folderMissing: false });

const OTHER_SERVER = { id: 'mcp_1', name: 'greennode-idp', transport: { type: 'stdio' } };
const KNOWLEDGE_SERVER = { id: 'project-kb-p1', name: BUILTIN_KNOWLEDGE_NAME, transport: { type: 'stdio' } };

const STALE = { conversationId: 'c1', projectId: 'p1', sessionMcpServers: [OTHER_SERVER] };

beforeEach(() => {
  localStorage.clear();
  listSourcesMock.mockReset().mockResolvedValue(listResult([source()]));
  unsubscribeMock.mockReset();
  updatedListener = null;
});

describe('useKbStaleChatHint', () => {
  it('becomes visible once the project reports an indexed source', async () => {
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    // Fails closed on the first render, before the fetch resolves.
    expect(result.current.visible).toBe(false);
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(listSourcesMock).toHaveBeenCalledWith({ projectId: 'p1' });
  });

  it('stays hidden for a chat that already has the knowledge server, and never queries', async () => {
    const { result } = renderHook(() =>
      useKbStaleChatHint({ ...STALE, sessionMcpServers: [OTHER_SERVER, KNOWLEDGE_SERVER] })
    );
    await waitFor(() => expect(listSourcesMock).not.toHaveBeenCalled());
    expect(result.current.visible).toBe(false);
  });

  it('stays hidden for a non-project chat, and never queries', async () => {
    const { result } = renderHook(() => useKbStaleChatHint({ ...STALE, projectId: undefined }));
    await waitFor(() => expect(listSourcesMock).not.toHaveBeenCalled());
    expect(result.current.visible).toBe(false);
  });

  it('requires passages, not merely a ready status — a new chat would be no better otherwise', async () => {
    listSourcesMock.mockResolvedValue(listResult([source({ chunkCount: 0 })]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.visible).toBe(false);
  });

  it('stays hidden while sources are only indexing', async () => {
    listSourcesMock.mockResolvedValue(listResult([source({ status: 'indexing', chunkCount: 0 })]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.visible).toBe(false);
  });

  it('stays hidden when the source list cannot be read', async () => {
    listSourcesMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.visible).toBe(false);
  });

  it('appears when a file is added mid-chat, via the projectKnowledge.updated push', async () => {
    listSourcesMock.mockResolvedValue(listResult([]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));
    expect(result.current.visible).toBe(false);

    listSourcesMock.mockResolvedValue(listResult([source()]));
    await act(async () => {
      updatedListener?.({ projectId: 'p1' });
    });
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it('ignores updates for other projects', async () => {
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(result.current.visible).toBe(true));
    await act(async () => {
      updatedListener?.({ projectId: 'other' });
    });
    expect(listSourcesMock).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  describe('dismissal', () => {
    it('hides the notice and persists the choice', async () => {
      const { result } = renderHook(() => useKbStaleChatHint(STALE));
      await waitFor(() => expect(result.current.visible).toBe(true));
      act(() => result.current.dismiss());
      expect(result.current.visible).toBe(false);
      expect(localStorage.getItem(kbStaleHintDismissKey('c1'))).toBe('1');
    });

    it('stays dismissed across a remount — this is what survives an app reload', async () => {
      localStorage.setItem(kbStaleHintDismissKey('c1'), '1');
      const { result } = renderHook(() => useKbStaleChatHint(STALE));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
      expect(result.current.visible).toBe(false);
    });

    it('does not leak between conversations', async () => {
      localStorage.setItem(kbStaleHintDismissKey('c1'), '1');
      const { result } = renderHook(() => useKbStaleChatHint({ ...STALE, conversationId: 'c2' }));
      await waitFor(() => expect(result.current.visible).toBe(true));
      expect(localStorage.getItem(kbStaleHintDismissKey('c2'))).toBeNull();
    });
  });
});
