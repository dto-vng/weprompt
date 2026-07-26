/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// DTOs for the per-project knowledge base, shared between the main-process
// projectKnowledgeService and the renderer. Node-free: only a type-only
// import from common/knowledge/types, so this file is safe from renderer
// type positions.

import type { KnowledgeSourceStatus } from '@/common/knowledge/types';

export type IKnowledgeSourceDto = {
  id: string;
  fileName: string;
  byteSize: number;
  status: KnowledgeSourceStatus;
  chunkCount: number;
  vectorCount: number;
  addedAt: number;
  error: string | null;
};

export type IProjectKnowledgeSummary = {
  fileCount: number;
  passageCount: number;
  semantic: 'on' | 'off';
};

export type IProjectKnowledgeListResult = {
  sources: IKnowledgeSourceDto[];
  summary: IProjectKnowledgeSummary;
};
