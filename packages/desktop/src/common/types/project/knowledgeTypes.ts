/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// DTOs for the per-project knowledge base, shared between the main-process
// projectKnowledgeService and the renderer. Node-free: only a type-only
// import from common/knowledge/types, so this file is safe from renderer
// type positions.

import type { KnowledgeIngestProgress, KnowledgeOcrProvenance, KnowledgeSourceStatus } from '@/common/knowledge/types';

export type IKnowledgeSourceDto = {
  id: string;
  fileName: string;
  byteSize: number;
  status: KnowledgeSourceStatus;
  chunkCount: number;
  vectorCount: number;
  addedAt: number;
  /**
   * Human-readable detail, overloaded by design: on a `failed` or
   * `unsupported` source this is the fatal reason, but a `ready` source can
   * ALSO carry a non-null, non-fatal note here (e.g. "Truncated to 2000
   * passages." when a source exceeded the per-source chunk cap). Consumers
   * must branch on `status`, never infer failure from `error` being present.
   */
  error: string | null;
  /**
   * Position within the current ingestion stage while `status` is `indexing`
   * (e.g. `{ stage: 'reading', done: 12, total: 50 }`), so the card can show
   * "Reading page 12/50" instead of a bare spinner. Null whenever nothing is
   * in flight — including for sources that settle too fast to report.
   */
  progress: KnowledgeIngestProgress | null;
  /**
   * Set when this source's text was TRANSCRIBED from a scan by a multimodal
   * model rather than read from the file. Null for every ordinary source.
   *
   * Surfaced because transcription can be wrong in ways reading cannot: the
   * card marks such a source and names the model plus any pages that produced
   * nothing, so a user who doubts an answer can see where the text came from.
   */
  ocr: KnowledgeOcrProvenance | null;
};

export type IProjectKnowledgeSummary = {
  fileCount: number;
  passageCount: number;
  semantic: 'on' | 'off';
};

export type IProjectKnowledgeListResult = {
  sources: IKnowledgeSourceDto[];
  summary: IProjectKnowledgeSummary;
  /**
   * True when the last sync found the project's `Knowledge Base/` folder
   * missing or unreadable while indexed sources exist. The index is preserved
   * while this is set; the card shows a warning + relink affordance instead of
   * treating the knowledge as deleted.
   */
  folderMissing: boolean;
};
