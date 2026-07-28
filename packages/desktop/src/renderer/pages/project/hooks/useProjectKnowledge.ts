/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IKnowledgeSourceDto, IProjectKnowledgeSummary } from '@/common/types/project/knowledgeTypes';
import { useCallback, useEffect, useState } from 'react';

export type UseProjectKnowledgeResult = {
  sources: IKnowledgeSourceDto[];
  summary: IProjectKnowledgeSummary | null;
  loading: boolean;
  error: boolean;
  addSources: (filePaths: string[]) => Promise<void>;
  removeSource: (sourceId: string) => Promise<void>;
  retrySource: (sourceId: string) => Promise<void>;
  refetch: () => Promise<void>;
};

/**
 * Data hook for the Project Home Knowledge card. Loads the project's
 * knowledge sources, refetches on the main process's `projectKnowledge.updated`
 * push (ingestion progresses in the background), and wraps the mutating IPC
 * calls with an eager refetch so the card reflects registration immediately.
 */
export const useProjectKnowledge = (projectId: string): UseProjectKnowledgeResult => {
  const [sources, setSources] = useState<IKnowledgeSourceDto[]>([]);
  const [summary, setSummary] = useState<IProjectKnowledgeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const result = await ipcBridge.projectKnowledge.listSources.invoke({ projectId });
      setSources(result.sources);
      setSummary(result.summary);
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
    const unsubscribe = ipcBridge.projectKnowledge.updated.on((payload) => {
      if (payload.projectId === projectId) void refetch();
    });
    return unsubscribe;
  }, [projectId, refetch]);

  const addSources = useCallback(
    async (filePaths: string[]) => {
      await ipcBridge.projectKnowledge.addSources.invoke({ projectId, filePaths });
      await refetch();
    },
    [projectId, refetch]
  );

  const removeSource = useCallback(
    async (sourceId: string) => {
      await ipcBridge.projectKnowledge.removeSource.invoke({ projectId, sourceId });
      await refetch();
    },
    [projectId, refetch]
  );

  const retrySource = useCallback(
    async (sourceId: string) => {
      await ipcBridge.projectKnowledge.retrySource.invoke({ projectId, sourceId });
      await refetch();
    },
    [projectId, refetch]
  );

  return { sources, summary, loading, error, addSources, removeSource, retrySource, refetch };
};
