/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { useKnowledgeFolderWatchers } from '@renderer/pages/conversation/projects/useKnowledgeFolderWatchers';

const watchFolderMock = vi.fn();
const unwatchFolderMock = vi.fn();
let projects: ForgeProject[] = [];

vi.mock('@/common', () => ({
  ipcBridge: {
    projectKnowledge: {
      watchFolder: { invoke: (...args: unknown[]) => watchFolderMock(...args) },
      unwatchFolder: { invoke: (...args: unknown[]) => unwatchFolderMock(...args) },
    },
  },
}));

vi.mock('@renderer/pages/conversation/projects/useProjects', () => ({
  useProjects: () => ({ projects, refreshProjects: vi.fn() }),
}));

const project = (id: string, workspace: string): ForgeProject => ({
  id,
  name: id,
  workspace,
  created_at: 1,
  updated_at: 1,
});

describe('useKnowledgeFolderWatchers', () => {
  beforeEach(() => {
    watchFolderMock.mockReset().mockResolvedValue(undefined);
    unwatchFolderMock.mockReset().mockResolvedValue(undefined);
    projects = [];
  });

  it('registers a watch for every known project on mount', async () => {
    projects = [project('p1', '/ws/alpha'), project('p2', '/ws/beta')];

    renderHook(() => useKnowledgeFolderWatchers());

    await waitFor(() => expect(watchFolderMock).toHaveBeenCalledTimes(2));
    expect(watchFolderMock).toHaveBeenCalledWith({ projectId: 'p1', workspace: '/ws/alpha' });
    expect(watchFolderMock).toHaveBeenCalledWith({ projectId: 'p2', workspace: '/ws/beta' });
  });

  it('does not re-register unchanged projects on re-render', async () => {
    projects = [project('p1', '/ws/alpha')];
    const { rerender } = renderHook(() => useKnowledgeFolderWatchers());
    await waitFor(() => expect(watchFolderMock).toHaveBeenCalledTimes(1));

    rerender();

    expect(watchFolderMock).toHaveBeenCalledTimes(1);
  });

  it('registers a project added after mount', async () => {
    projects = [project('p1', '/ws/alpha')];
    const { rerender } = renderHook(() => useKnowledgeFolderWatchers());
    await waitFor(() => expect(watchFolderMock).toHaveBeenCalledTimes(1));

    projects = [project('p1', '/ws/alpha'), project('p2', '/ws/beta')];
    rerender();

    await waitFor(() => expect(watchFolderMock).toHaveBeenCalledWith({ projectId: 'p2', workspace: '/ws/beta' }));
  });

  it('re-registers a project whose workspace was relinked', async () => {
    projects = [project('p1', '/ws/alpha')];
    const { rerender } = renderHook(() => useKnowledgeFolderWatchers());
    await waitFor(() => expect(watchFolderMock).toHaveBeenCalledTimes(1));

    projects = [project('p1', '/ws/moved')];
    rerender();

    await waitFor(() => expect(watchFolderMock).toHaveBeenCalledWith({ projectId: 'p1', workspace: '/ws/moved' }));
  });

  it('unwatches a project that was deleted', async () => {
    projects = [project('p1', '/ws/alpha'), project('p2', '/ws/beta')];
    const { rerender } = renderHook(() => useKnowledgeFolderWatchers());
    await waitFor(() => expect(watchFolderMock).toHaveBeenCalledTimes(2));

    projects = [project('p1', '/ws/alpha')];
    rerender();

    await waitFor(() => expect(unwatchFolderMock).toHaveBeenCalledWith({ projectId: 'p2' }));
  });

  it('keeps going when one registration fails', async () => {
    watchFolderMock.mockRejectedValueOnce(new Error('main is unhappy'));
    projects = [project('p1', '/ws/alpha'), project('p2', '/ws/beta')];

    const { unmount } = renderHook(() => useKnowledgeFolderWatchers());

    await waitFor(() => expect(watchFolderMock).toHaveBeenCalledTimes(2));
    expect(() => unmount()).not.toThrow();
  });
});
