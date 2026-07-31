/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISessionMcpServer } from '@/common/config/storage';
import type { IKnowledgeSourceDto, IProjectKnowledgeListResult } from '@/common/types/project/knowledgeTypes';
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

/** Typed against the real DTO so a shape change fails here rather than silently. */
const source = (over: Partial<IKnowledgeSourceDto> = {}): IKnowledgeSourceDto => ({
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

const listResult = (sources: IKnowledgeSourceDto[]): IProjectKnowledgeListResult => ({
  sources,
  summary: { fileCount: sources.length, passageCount: 0, semantic: 'off' },
  folderMissing: false,
});

const OTHER_SERVER: ISessionMcpServer = { id: 'mcp_1', name: 'greennode-idp', transport: { type: 'stdio' } };
const KNOWLEDGE_SERVER: ISessionMcpServer = {
  id: 'project-kb-p1',
  name: BUILTIN_KNOWLEDGE_NAME,
  transport: { type: 'stdio' },
};

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
    expect(result.current.show).toBe(false);
    await waitFor(() => expect(result.current.show).toBe(true));
    expect(listSourcesMock).toHaveBeenCalledWith({ projectId: 'p1' });
  });

  it('never shows for a chat that already has the knowledge server', async () => {
    const { result } = renderHook(() => useKbStaleChatHint(WITH_TOOL));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.show).toBe(false);
  });

  it('stays hidden for a non-project chat, and never queries', async () => {
    const { result } = renderHook(() => useKbStaleChatHint({ ...STALE, projectId: undefined }));
    await waitFor(() => expect(listSourcesMock).not.toHaveBeenCalled());
    expect(result.current.show).toBe(false);
  });

  it('requires passages, not merely a ready status — a new chat would be no better otherwise', async () => {
    listSourcesMock.mockResolvedValue(listResult([source({ chunkCount: 0 })]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.show).toBe(false);
  });

  it('stays hidden while sources are only indexing', async () => {
    listSourcesMock.mockResolvedValue(listResult([source({ status: 'indexing', chunkCount: 0 })]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.show).toBe(false);
  });

  it('stays hidden when the source list cannot be read', async () => {
    listSourcesMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    expect(result.current.show).toBe(false);
  });

  it('appears when a file is added mid-chat, via the projectKnowledge.updated push', async () => {
    listSourcesMock.mockResolvedValue(listResult([]));
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));
    expect(result.current.show).toBe(false);

    listSourcesMock.mockResolvedValue(listResult([source()]));
    await act(async () => {
      updatedListener?.({ projectId: 'p1' });
    });
    await waitFor(() => expect(result.current.show).toBe(true));
  });

  it('ignores updates for other projects', async () => {
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(result.current.show).toBe(true));
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

  it('lets the newest response win when refetches overlap', async () => {
    // `updated` fires per manifest write, so a slow early fetch landing after a
    // fast later one must not resurrect its stale answer.
    let releaseFirst!: (value: IProjectKnowledgeListResult) => void;
    listSourcesMock.mockReturnValueOnce(
      new Promise<IProjectKnowledgeListResult>((resolve) => {
        releaseFirst = resolve;
      })
    );
    const { result } = renderHook(() => useKbStaleChatHint(STALE));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(1));

    listSourcesMock.mockResolvedValue(listResult([source()]));
    await act(async () => {
      updatedListener?.({ projectId: 'p1' });
    });
    await waitFor(() => expect(result.current.show).toBe(true));

    // The stale first response resolves last, claiming no sources.
    await act(async () => {
      releaseFirst(listResult([]));
    });
    expect(result.current.show).toBe(true);
  });

  it('drops the previous project’s answer when the project changes', async () => {
    // Regression: keeping the old project's `hasIndexedSource` would show the
    // notice against the wrong project while the new fetch is in flight — the
    // one direction this feature must never fail in.
    const { result, rerender } = renderHook(
      (props: { projectId: string }) => useKbStaleChatHint({ ...STALE, projectId: props.projectId }),
      { initialProps: { projectId: 'p1' } }
    );
    await waitFor(() => expect(result.current.show).toBe(true));

    let releaseSecond!: (value: IProjectKnowledgeListResult) => void;
    listSourcesMock.mockReturnValueOnce(
      new Promise<IProjectKnowledgeListResult>((resolve) => {
        releaseSecond = resolve;
      })
    );
    rerender({ projectId: 'p2' });
    // p2 has not answered yet, so nothing may be claimed about it.
    expect(result.current.show).toBe(false);

    await act(async () => {
      releaseSecond(listResult([source({ id: 's9' })]));
    });
    await waitFor(() => expect(result.current.show).toBe(true));
    expect(listSourcesMock).toHaveBeenLastCalledWith({ projectId: 'p2' });
  });

  describe('dismissal', () => {
    it('hides the notice and persists the choice', async () => {
      const { result } = renderHook(() => useKbStaleChatHint(STALE));
      await waitFor(() => expect(result.current.show).toBe(true));
      act(() => result.current.dismiss());
      expect(result.current.show).toBe(false);
      expect(localStorage.getItem(kbStaleHintDismissKey('c1'))).toBe('1');
    });

    it('stays dismissed across a remount — this is what survives an app reload', async () => {
      localStorage.setItem(kbStaleHintDismissKey('c1'), '1');
      const { result } = renderHook(() => useKbStaleChatHint(STALE));
      await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
      expect(result.current.show).toBe(false);
    });

    it('does not leak between conversations', async () => {
      localStorage.setItem(kbStaleHintDismissKey('c1'), '1');
      const { result } = renderHook(() => useKbStaleChatHint({ ...STALE, conversationId: 'c2' }));
      await waitFor(() => expect(result.current.show).toBe(true));
      expect(localStorage.getItem(kbStaleHintDismissKey('c2'))).toBeNull();
    });

    it('re-reads the dismissal when switching to another chat in the same project', async () => {
      localStorage.setItem(kbStaleHintDismissKey('c2'), '1');
      const { result, rerender } = renderHook(
        (props: { conversationId: string }) => useKbStaleChatHint({ ...STALE, conversationId: props.conversationId }),
        { initialProps: { conversationId: 'c1' } }
      );
      await waitFor(() => expect(result.current.show).toBe(true));
      rerender({ conversationId: 'c2' });
      await waitFor(() => expect(result.current.show).toBe(false));
    });
  });
});
