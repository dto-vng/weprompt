/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Wires ipcBridge.projectKnowledge.* to the main-process knowledge service.
// The service is created lazily so initStorage's cacheDir is resolved first.
// This module also owns the folder watcher: watches are registered by the
// renderer (the project registry lives in renderer localStorage), and every
// successful sync re-registers, which is what recovers a watch that could not
// be established because the folder did not exist yet.

import { shell } from 'electron';
import { ipcBridge } from '@/common';
import { httpRequest } from '@/common/adapter/httpBridge';
import type { IProvider } from '@/common/config/storage';
import { documentConverter } from '@/common/chat/document/DocumentConverter';
import { getBuiltinMcpScriptPath, getProjectKbRootDir } from '@process/utils/initStorage';
import { BUILTIN_KNOWLEDGE_SCRIPT } from '@process/resources/builtinMcp/constants';
import {
  createKnowledgeFolderWatcher,
  type KnowledgeFolderWatcher,
} from '@process/services/projectKnowledge/knowledgeFolderWatcher';
import {
  createProjectKnowledgeService,
  type ProjectKnowledgeService,
  type ProjectKnowledgeServiceDeps,
} from '@process/services/projectKnowledge/projectKnowledgeService';

/** Production dependency wiring for the knowledge service. Exported for tests. */
export const buildProjectKnowledgeDeps = (): ProjectKnowledgeServiceDeps => ({
  storeRootDir: getProjectKbRootDir(),
  listProviders: () => httpRequest<IProvider[]>('GET', '/api/providers'),
  convertToMarkdown: (buffer, extension) =>
    extension === 'docx' ? documentConverter.wordToMarkdown(buffer) : documentConverter.excelToMarkdown(buffer),
  // Reversible by design: a knowledge file is the user's own document.
  trashItem: (filePath) => shell.trashItem(filePath),
  getServerScriptPath: () => getBuiltinMcpScriptPath(BUILTIN_KNOWLEDGE_SCRIPT),
  onUpdated: (projectId) => ipcBridge.projectKnowledge.updated.emit({ projectId }),
});

let service: ProjectKnowledgeService | null = null;
let watcher: KnowledgeFolderWatcher | null = null;

const getService = (): ProjectKnowledgeService => {
  service ??= createProjectKnowledgeService(buildProjectKnowledgeDeps());
  return service;
};

/**
 * Sync, then (re)register the watch. Re-registering is deliberate and
 * load-bearing: a project whose `Knowledge Base/` folder did not exist when
 * the renderer first asked to watch it has no live watcher, and the sync that
 * just created or found the folder is exactly the moment one can be attached.
 */
const syncAndWatch = async (projectId: string, workspace: string): Promise<void> => {
  try {
    await getService().syncFolder(projectId, workspace);
  } finally {
    getWatcher().watch(projectId, workspace);
  }
};

const getWatcher = (): KnowledgeFolderWatcher => {
  watcher ??= createKnowledgeFolderWatcher({
    onSync: (projectId, workspace) => {
      void syncAndWatch(projectId, workspace).catch((error: unknown) => {
        console.warn(`[projectKnowledge] watch-triggered sync failed for ${projectId}:`, error);
      });
    },
  });
  return watcher;
};

export function initProjectKnowledgeBridge(): void {
  ipcBridge.projectKnowledge.listSources.provider(({ projectId }) => getService().listSources(projectId));
  ipcBridge.projectKnowledge.addSources.provider(({ projectId, filePaths, workspace }) =>
    getService().addSources(projectId, filePaths, workspace)
  );
  ipcBridge.projectKnowledge.removeSource.provider(({ projectId, sourceId, workspace }) =>
    getService().removeSource(projectId, sourceId, workspace)
  );
  ipcBridge.projectKnowledge.retrySource.provider(({ projectId, sourceId, workspace }) =>
    getService().retrySource(projectId, sourceId, workspace)
  );
  ipcBridge.projectKnowledge.syncFolder.provider(({ projectId, workspace }) => syncAndWatch(projectId, workspace));
  ipcBridge.projectKnowledge.watchFolder.provider(async ({ projectId, workspace }) => {
    getWatcher().watch(projectId, workspace);
    // Catch-up pass: events that happened while the app was closed produced
    // no watcher callback, so registering a watch also has to reconcile once.
    void syncAndWatch(projectId, workspace).catch((error: unknown) => {
      console.warn(`[projectKnowledge] initial sync failed for ${projectId}:`, error);
    });
  });
  ipcBridge.projectKnowledge.unwatchFolder.provider(async ({ projectId }) => {
    getWatcher().unwatch(projectId);
  });
  ipcBridge.projectKnowledge.getSourceText.provider(({ projectId, sourceId }) =>
    getService().getSourceText(projectId, sourceId)
  );
  ipcBridge.projectKnowledge.removeStore.provider(async ({ projectId }) => {
    getWatcher().unwatch(projectId);
    await getService().removeStore(projectId);
  });
  ipcBridge.projectKnowledge.getSessionMcpServer.provider(({ projectId }) =>
    getService().getSessionMcpServer(projectId)
  );
}
