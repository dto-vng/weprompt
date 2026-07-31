/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_KNOWLEDGE_NAME } from '@/common/knowledge/constants';
import {
  kbChangedHintDismissKey,
  kbStaleHintDismissKey,
  useKbStaleChatHint,
} from '@/renderer/pages/conversation/knowledge/useKbStaleChatHint';

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
const WITH_TOOL = { conversationId: 'c1', projectId: 'p1', sessionMcpServers: [OTHER_SERVER, KNOWLEDGE_SERVER] };

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
    expect(result.current.variant).toBe(null);
    await waitFor(() => expect(result.current.variant).toBe('stale'));
    expect(listSourcesMock).toHaveBeenCalledWith({ projectId: 'p1' });
  });

  it('never shows the stale notice for a chat that already has the knowledge server', async () => {
    const { result } = renderHook(() => useKbStaleChatHint(WITH_TOOL));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.variant).toBe(null);
  });

  it('stays hidden for a non-project chat, and never queries', async () => {
    const { result } = renderHook(() => useKbStaleChatHint({ ...STALE, projectId: undefined }));
    await waitFor(() => expect(listSourcesMock).not.toHaveBeenCalled());
    expect(result.current.variant).toBe(null);
  });

  it('requires passages, not merely a ready status — a new chat would be no better otherwise', async () => {
    listSourcesMock.mockResolvedValue(listResult([source({ chunkCount: 0 })]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.variant).toBe(null);
  });

  it('stays hidden while sources are only indexing', async () => {
    listSourcesMock.mockResolvedValue(listResult([source({ status: 'indexing', chunkCount: 0 })]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.variant).toBe(null);
  });

  it('stays hidden when the source list cannot be read', async () => {
    listSourcesMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.variant).toBe(null);
  });

  it('appears when a file is added mid-chat, via the projectKnowledge.updated push', async () => {
    listSourcesMock.mockResolvedValue(listResult([]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));
    expect(result.current.variant).toBe(null);

    listSourcesMock.mockResolvedValue(listResult([source()]));
    await act(async () => {
      updatedListener?.({ projectId: 'p1' });
    });
    await waitFor(() => expect(result.current.variant).toBe('stale'));
  });

  it('ignores updates for other projects', async () => {
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(result.current.variant).toBe('stale'));
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
      await waitFor(() => expect(result.current.variant).toBe('stale'));
      act(() => result.current.dismiss());
      expect(result.current.variant).toBe(null);
      expect(localStorage.getItem(kbStaleHintDismissKey('c1'))).toBe('1');
    });

    it('stays dismissed across a remount — this is what survives an app reload', async () => {
      localStorage.setItem(kbStaleHintDismissKey('c1'), '1');
      const { result } = renderHook(() => useKbStaleChatHint(STALE));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
      expect(result.current.variant).toBe(null);
    });

    it('does not leak between conversations', async () => {
      localStorage.setItem(kbStaleHintDismissKey('c1'), '1');
      const { result } = renderHook(() => useKbStaleChatHint({ ...STALE, conversationId: 'c2' }));
      await waitFor(() => expect(result.current.variant).toBe('stale'));
      expect(localStorage.getItem(kbStaleHintDismissKey('c2'))).toBeNull();
    });
  });

  /**
   * Case B — a chat that HAS the tool still cannot see files indexed after its
   * session spawned (verified live 2026-07-31).
   */
  describe('knowledge changed under a tool-equipped chat', () => {
    it('stays quiet while the source set is unchanged', async () => {
      const { result } = renderHook(() => useKbStaleChatHint(WITH_TOOL));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));
      await act(async () => {
        updatedListener?.({ projectId: 'p1' });
      });
      expect(result.current.variant).toBe(null);
    });

    it('warns once a source that was absent at mount becomes ready', async () => {
      const { result } = renderHook(() => useKbStaleChatHint(WITH_TOOL));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));
      expect(result.current.variant).toBe(null);

      listSourcesMock.mockResolvedValue(listResult([source(), source({ id: 's2', fileName: 'new.md' })]));
      await act(async () => {
        updatedListener?.({ projectId: 'p1' });
      });
      await waitFor(() => expect(result.current.variant).toBe('changed'));
    });

    it('does not re-fire on further updates to a source that was already searchable at mount', async () => {
      const { result } = renderHook(() => useKbStaleChatHint(WITH_TOOL));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));

      // s1 was ready at mount and merely gains vectors. The running session was
      // spawned with it in the store, so there is nothing new to warn about.
      listSourcesMock.mockResolvedValue(listResult([source({ vectorCount: 12 })]));
      await act(async () => {
        updatedListener?.({ projectId: 'p1' });
      });
      expect(result.current.variant).toBe(null);
    });

    it('fires when a source that was still indexing at mount becomes searchable', async () => {
      listSourcesMock.mockResolvedValue(
        listResult([source(), source({ id: 's2', status: 'indexing', chunkCount: 0 })])
      );
      const { result } = renderHook(() => useKbStaleChatHint(WITH_TOOL));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));
      expect(result.current.variant).toBe(null);

      // s2 was not in the searchable store when the session spawned, so once it
      // lands the running session still cannot see it.
      listSourcesMock.mockResolvedValue(listResult([source(), source({ id: 's2', status: 'ready', chunkCount: 3 })]));
      await act(async () => {
        updatedListener?.({ projectId: 'p1' });
      });
      await waitFor(() => expect(result.current.variant).toBe('changed'));
    });

    it('dismissing the changed notice uses its own key and leaves the stale key alone', async () => {
      const { result } = renderHook(() => useKbStaleChatHint(WITH_TOOL));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));
      listSourcesMock.mockResolvedValue(listResult([source(), source({ id: 's2', fileName: 'new.md' })]));
      await act(async () => {
        updatedListener?.({ projectId: 'p1' });
      });
      await waitFor(() => expect(result.current.variant).toBe('changed'));

      act(() => result.current.dismiss());
      expect(result.current.variant).toBe(null);
      expect(localStorage.getItem(kbChangedHintDismissKey('c1'))).toBe('1');
      expect(localStorage.getItem(kbStaleHintDismissKey('c1'))).toBeNull();
    });

    it('is forgotten on remount, because a respawned session can search again', async () => {
      const { result, unmount } = renderHook(() => useKbStaleChatHint(WITH_TOOL));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));
      listSourcesMock.mockResolvedValue(listResult([source(), source({ id: 's2', fileName: 'new.md' })]));
      await act(async () => {
        updatedListener?.({ projectId: 'p1' });
      });
      await waitFor(() => expect(result.current.variant).toBe('changed'));
      unmount();

      const remounted = renderHook(() => useKbStaleChatHint(WITH_TOOL));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
      expect(remounted.result.current.variant).toBe(null);
    });
  });
});
