/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProjectKnowledgeListResult } from '@/common/types/project/knowledgeTypes';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { useProjectKnowledge } from '@/renderer/pages/project/hooks/useProjectKnowledge';

const listSourcesMock = vi.fn();
const addSourcesMock = vi.fn();
const removeSourceMock = vi.fn();
const retrySourceMock = vi.fn();
const syncFolderMock = vi.fn();
const getSourceTextMock = vi.fn();
let updatedListener: ((payload: { projectId: string }) => void) | null = null;
const offMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    projectKnowledge: {
      listSources: { invoke: (...args: unknown[]) => listSourcesMock(...args) },
      addSources: { invoke: (...args: unknown[]) => addSourcesMock(...args) },
      removeSource: { invoke: (...args: unknown[]) => removeSourceMock(...args) },
      retrySource: { invoke: (...args: unknown[]) => retrySourceMock(...args) },
      syncFolder: { invoke: (...args: unknown[]) => syncFolderMock(...args) },
      getSourceText: { invoke: (...args: unknown[]) => getSourceTextMock(...args) },
      updated: {
        on: (listener: (payload: { projectId: string }) => void) => {
          updatedListener = listener;
          return offMock;
        },
      },
    },
  },
}));

const PROJECT: ForgeProject = {
  id: 'p1',
  name: 'Alpha',
  workspace: '/ws/alpha',
  created_at: 1,
  updated_at: 1,
};

const RESULT: IProjectKnowledgeListResult = {
  sources: [
    {
      id: 's1',
      fileName: 'a.md',
      byteSize: 10,
      status: 'ready',
      chunkCount: 3,
      vectorCount: 3,
      addedAt: 1,
      error: null,
      progress: null,
    },
  ],
  summary: { fileCount: 1, passageCount: 3, semantic: 'on' },
  folderMissing: false,
};

describe('useProjectKnowledge', () => {
  beforeEach(() => {
    listSourcesMock.mockReset().mockResolvedValue(RESULT);
    addSourcesMock.mockReset().mockResolvedValue(undefined);
    removeSourceMock.mockReset().mockResolvedValue(undefined);
    retrySourceMock.mockReset().mockResolvedValue(undefined);
    syncFolderMock.mockReset().mockResolvedValue(undefined);
    getSourceTextMock.mockReset().mockResolvedValue({ text: '# body', truncated: false });
    offMock.mockReset();
    updatedListener = null;
  });

  it('loads sources on mount', async () => {
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listSourcesMock).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(result.current.sources).toHaveLength(1);
    expect(result.current.summary?.semantic).toBe('on');
    expect(result.current.error).toBe(false);
  });

  // Mount is one of the sync points: opening Project Home is how a file
  // dropped in via Finder while the app was closed gets picked up.
  it('syncs the folder on mount', async () => {
    renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(syncFolderMock).toHaveBeenCalledWith({ projectId: 'p1', workspace: '/ws/alpha' }));
  });

  it('still loads the list when the mount sync fails', async () => {
    syncFolderMock.mockRejectedValue(new Error('sync exploded'));
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sources).toHaveLength(1);
    expect(result.current.error).toBe(false);
  });

  it('surfaces folderMissing from the list result', async () => {
    listSourcesMock.mockResolvedValue({ ...RESULT, folderMissing: true });
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.folderMissing).toBe(true);
    expect(result.current.sources).toHaveLength(1); // index survives a missing folder
  });

  it('sets error when listSources rejects', async () => {
    listSourcesMock.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
  });

  it('refetches when an updated event for this project arrives, ignores others', async () => {
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initialCalls = listSourcesMock.mock.calls.length;
    act(() => updatedListener?.({ projectId: 'other' }));
    expect(listSourcesMock).toHaveBeenCalledTimes(initialCalls);
    act(() => updatedListener?.({ projectId: 'p1' }));
    await waitFor(() => expect(listSourcesMock.mock.calls.length).toBeGreaterThan(initialCalls));
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    unmount();
    expect(offMock).toHaveBeenCalled();
  });

  it('addSources passes the workspace so files land in the folder', async () => {
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.addSources(['/tmp/x.md']);
    });
    expect(addSourcesMock).toHaveBeenCalledWith({
      projectId: 'p1',
      filePaths: ['/tmp/x.md'],
      workspace: '/ws/alpha',
    });
  });

  it('removeSource and retrySource pass the workspace', async () => {
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.removeSource('s1');
      await result.current.retrySource('s1');
    });
    expect(removeSourceMock).toHaveBeenCalledWith({ projectId: 'p1', sourceId: 's1', workspace: '/ws/alpha' });
    expect(retrySourceMock).toHaveBeenCalledWith({ projectId: 'p1', sourceId: 's1', workspace: '/ws/alpha' });
  });

  it('syncNow re-syncs the folder and refetches', async () => {
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(result.current.loading).toBe(false));
    syncFolderMock.mockClear();
    const before = listSourcesMock.mock.calls.length;

    await act(async () => {
      await result.current.syncNow();
    });

    expect(syncFolderMock).toHaveBeenCalledWith({ projectId: 'p1', workspace: '/ws/alpha' });
    expect(listSourcesMock.mock.calls.length).toBeGreaterThan(before);
  });

  it('getSourceText fetches the indexed text for one source', async () => {
    const { result } = renderHook(() => useProjectKnowledge(PROJECT));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.getSourceText('s1')).resolves.toEqual({ text: '# body', truncated: false });
    });
    expect(getSourceTextMock).toHaveBeenCalledWith({ projectId: 'p1', sourceId: 's1' });
  });
});
