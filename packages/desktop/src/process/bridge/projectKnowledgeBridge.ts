/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Wires ipcBridge.projectKnowledge.* to the main-process knowledge service.
// The service is created lazily so initStorage's cacheDir is resolved first.

import { ipcBridge } from '@/common';
import { httpRequest } from '@/common/adapter/httpBridge';
import type { IProvider } from '@/common/config/storage';
import { documentConverter } from '@/common/chat/document/DocumentConverter';
import { getBuiltinMcpScriptPath, getProjectKbRootDir } from '@process/utils/initStorage';
import { BUILTIN_KNOWLEDGE_SCRIPT } from '@process/resources/builtinMcp/constants';
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
  getServerScriptPath: () => getBuiltinMcpScriptPath(BUILTIN_KNOWLEDGE_SCRIPT),
  onUpdated: (projectId) => ipcBridge.projectKnowledge.updated.emit({ projectId }),
});

let service: ProjectKnowledgeService | null = null;

const getService = (): ProjectKnowledgeService => {
  service ??= createProjectKnowledgeService(buildProjectKnowledgeDeps());
  return service;
};

export function initProjectKnowledgeBridge(): void {
  ipcBridge.projectKnowledge.listSources.provider(({ projectId }) => getService().listSources(projectId));
  ipcBridge.projectKnowledge.addSources.provider(({ projectId, filePaths }) =>
    getService().addSources(projectId, filePaths)
  );
  ipcBridge.projectKnowledge.removeSource.provider(({ projectId, sourceId }) =>
    getService().removeSource(projectId, sourceId)
  );
  ipcBridge.projectKnowledge.retrySource.provider(({ projectId, sourceId }) =>
    getService().retrySource(projectId, sourceId)
  );
  ipcBridge.projectKnowledge.removeStore.provider(({ projectId }) => getService().removeStore(projectId));
  ipcBridge.projectKnowledge.getSessionMcpServer.provider(({ projectId }) =>
    getService().getSessionMcpServer(projectId)
  );
}
