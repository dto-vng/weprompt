/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProjectKnowledgeListResult } from '@/common/types/project/knowledgeTypes';
import { useProjectKnowledge } from '@/renderer/pages/project/hooks/useProjectKnowledge';

const listSourcesMock = vi.fn();
const addSourcesMock = vi.fn();
const removeSourceMock = vi.fn();
const retrySourceMock = vi.fn();
let updatedListener: ((payload: { projectId: string }) => void) | null = null;
const offMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    projectKnowledge: {
      listSources: { invoke: (...args: unknown[]) => listSourcesMock(...args) },
      addSources: { invoke: (...args: unknown[]) => addSourcesMock(...args) },
      removeSource: { invoke: (...args: unknown[]) => removeSourceMock(...args) },
      retrySource: { invoke: (...args: unknown[]) => retrySourceMock(...args) },
      updated: {
        on: (listener: (payload: { projectId: string }) => void) => {
          updatedListener = listener;
          return offMock;
        },
      },
    },
  },
}));

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
    },
  ],
  summary: { fileCount: 1, passageCount: 3, semantic: 'on' },
};

describe('useProjectKnowledge', () => {
  beforeEach(() => {
    listSourcesMock.mockReset().mockResolvedValue(RESULT);
    addSourcesMock.mockReset().mockResolvedValue(undefined);
    removeSourceMock.mockReset().mockResolvedValue(undefined);
    retrySourceMock.mockReset().mockResolvedValue(undefined);
    offMock.mockReset();
    updatedListener = null;
  });

  it('loads sources on mount', async () => {
    const { result } = renderHook(() => useProjectKnowledge('p1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listSourcesMock).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(result.current.sources).toHaveLength(1);
    expect(result.current.summary?.semantic).toBe('on');
    expect(result.current.error).toBe(false);
  });

  it('sets error when listSources rejects', async () => {
    listSourcesMock.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useProjectKnowledge('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
  });

  it('refetches when an updated event for this project arrives, ignores others', async () => {
    const { result } = renderHook(() => useProjectKnowledge('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listSourcesMock).toHaveBeenCalledTimes(1);
    act(() => updatedListener?.({ projectId: 'other' }));
    expect(listSourcesMock).toHaveBeenCalledTimes(1);
    act(() => updatedListener?.({ projectId: 'p1' }));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalledTimes(2));
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useProjectKnowledge('p1'));
    await waitFor(() => expect(listSourcesMock).toHaveBeenCalled());
    unmount();
    expect(offMock).toHaveBeenCalled();
  });

  it('addSources invokes IPC then refetches', async () => {
    const { result } = renderHook(() => useProjectKnowledge('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.addSources(['/tmp/x.md']);
    });
    expect(addSourcesMock).toHaveBeenCalledWith({ projectId: 'p1', filePaths: ['/tmp/x.md'] });
    expect(listSourcesMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('removeSource and retrySource invoke IPC then refetch', async () => {
    const { result } = renderHook(() => useProjectKnowledge('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.removeSource('s1');
      await result.current.retrySource('s1');
    });
    expect(removeSourceMock).toHaveBeenCalledWith({ projectId: 'p1', sourceId: 's1' });
    expect(retrySourceMock).toHaveBeenCalledWith({ projectId: 'p1', sourceId: 's1' });
  });
});
