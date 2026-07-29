/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useEffect, useRef } from 'react';

import { useProjects } from './useProjects';

/**
 * Keeps the main process watching every project's `Knowledge Base/` folder.
 *
 * The project registry lives in renderer localStorage, so main cannot
 * enumerate projects at boot — registration has to come from here. Mounted
 * once in the app shell; it diffs the project list on every change so a
 * created, relinked, or deleted project updates its watch.
 *
 * Failures are logged and swallowed: live watching is an enhancement over the
 * mount / Refresh / chat-creation sync points, never the only path.
 */
export const useKnowledgeFolderWatchers = (): void => {
  const { projects } = useProjects();
  const watchedRef = useRef(new Map<string, string>());

  useEffect(() => {
    const watched = watchedRef.current;
    const seen = new Set<string>();

    for (const project of projects) {
      seen.add(project.id);
      if (watched.get(project.id) === project.workspace) continue;
      watched.set(project.id, project.workspace);
      void ipcBridge.projectKnowledge.watchFolder
        .invoke({ projectId: project.id, workspace: project.workspace })
        .catch((error: unknown) => console.error('Failed to watch knowledge folder:', error));
    }

    for (const projectId of [...watched.keys()]) {
      if (seen.has(projectId)) continue;
      watched.delete(projectId);
      void ipcBridge.projectKnowledge.unwatchFolder
        .invoke({ projectId })
        .catch((error: unknown) => console.error('Failed to unwatch knowledge folder:', error));
    }
  }, [projects]);
};
