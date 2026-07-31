/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IKnowledgeSourceDto, IProjectKnowledgeSummary } from '@/common/types/project/knowledgeTypes';
import type { ForgeProject } from '@/common/types/project/projectTypes';
import { useCallback, useEffect, useState } from 'react';

export type UseProjectKnowledgeResult = {
  sources: IKnowledgeSourceDto[];
  summary: IProjectKnowledgeSummary | null;
  loading: boolean;
  error: boolean;
  /** The `Knowledge Base/` folder could not be read; the index is preserved. */
  folderMissing: boolean;
  addSources: (filePaths: string[]) => Promise<void>;
  removeSource: (sourceId: string) => Promise<void>;
  retrySource: (sourceId: string) => Promise<void>;
  /** Re-scan the folder now (Refresh, relink) and reload the list. */
  syncNow: () => Promise<void>;
  getSourceText: (sourceId: string) => Promise<{ text: string; truncated: boolean }>;
  refetch: () => Promise<void>;
};

/**
 * Data hook for the Project Home Knowledge card. The project's
 * `Knowledge Base/` folder is the source of truth, so mounting the card also
 * syncs it — that is what picks up files dropped in via Finder while the app
 * was closed. Refetches on the main process's `projectKnowledge.updated`
 * push, which is how background ingestion progress reaches the card.
 */
export const useProjectKnowledge = (project: ForgeProject): UseProjectKnowledgeResult => {
  const { id: projectId, workspace } = project;
  const [sources, setSources] = useState<IKnowledgeSourceDto[]>([]);
  const [summary, setSummary] = useState<IProjectKnowledgeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [folderMissing, setFolderMissing] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const result = await ipcBridge.projectKnowledge.listSources.invoke({ projectId });
      setSources(result.sources);
      setSummary(result.summary);
      setFolderMissing(result.folderMissing);
      setError(false);
    } catch (fetchError) {
      console.error('Failed to load project knowledge:', fetchError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
    // Fire-and-forget: ingestion can take a while, and the list above already
    // shows whatever is indexed. The sync's own `updated` emissions refresh
    // the card as it progresses.
    void ipcBridge.projectKnowledge.syncFolder
      .invoke({ projectId, workspace })
      .catch((syncError: unknown) => console.error('Failed to sync knowledge folder:', syncError));
    const unsubscribe = ipcBridge.projectKnowledge.updated.on((payload) => {
      if (payload.projectId === projectId) void refetch();
    });
    return unsubscribe;
  }, [projectId, workspace, refetch]);

  // The three mutators below refetch in `finally` and let the rejection through, the same
  // shape as syncNow. Two reasons, both load-bearing: a failed invoke must still refetch or
  // the list keeps showing state the backend no longer has, and the rejection has to reach
  // the caller because this hook has no i18n or Arco — the card owns the toast.
  const addSources = useCallback(
    async (filePaths: string[]) => {
      try {
        await ipcBridge.projectKnowledge.addSources.invoke({ projectId, filePaths, workspace });
      } finally {
        await refetch();
      }
    },
    [projectId, workspace, refetch]
  );

  const removeSource = useCallback(
    async (sourceId: string) => {
      try {
        await ipcBridge.projectKnowledge.removeSource.invoke({ projectId, sourceId, workspace });
      } finally {
        await refetch();
      }
    },
    [projectId, workspace, refetch]
  );

  const retrySource = useCallback(
    async (sourceId: string) => {
      try {
        await ipcBridge.projectKnowledge.retrySource.invoke({ projectId, sourceId, workspace });
      } finally {
        await refetch();
      }
    },
    [projectId, workspace, refetch]
  );

  const syncNow = useCallback(async () => {
    try {
      await ipcBridge.projectKnowledge.syncFolder.invoke({ projectId, workspace });
    } finally {
      // Refetch even on failure: the sync may have flipped folderMissing,
      // which is precisely what the user needs to see.
      await refetch();
    }
  }, [projectId, workspace, refetch]);

  const getSourceText = useCallback(
    (sourceId: string) => ipcBridge.projectKnowledge.getSourceText.invoke({ projectId, sourceId }),
    [projectId]
  );

  return {
    sources,
    summary,
    loading,
    error,
    folderMissing,
    addSources,
    removeSource,
    retrySource,
    syncNow,
    getSourceText,
    refetch,
  };
};
