// packages/desktop/src/common/knowledge/types.ts
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Shared types for the per-project knowledge base. Node-free: safe to import
// from renderer type positions, though runtime knowledge modules (store,
// searchCore, …) are main-process/subprocess only.

export type KnowledgeSourceStatus = 'indexing' | 'ready' | 'failed' | 'unsupported';

export type KnowledgeChunk = {
  chunkId: string; // `${sourceId}#${chunkIndex}`
  sourceId: string;
  chunkIndex: number;
  text: string;
  headingPath?: string; // "Onboarding > Visa letters"
  hasVector: boolean;
};

export type KnowledgeHit = {
  sourceId: string;
  sourceName: string;
  chunkIndex: number;
  text: string;
  score: number;
  headingPath?: string;
};

export type KnowledgeManifestSource = {
  id: string;
  fileName: string;
  contentHash: string; // "sha256:<hex>"
  byteSize: number;
  status: KnowledgeSourceStatus;
  chunkCount: number;
  vectorCount: number;
  addedAt: number;
  error: string | null;
};

export type KnowledgeManifest = {
  schemaVersion: 1;
  projectId: string;
  /** Pinned at first successful embed; null = BM25-only. */
  embedding: { model: string; dim: number } | null;
  sources: KnowledgeManifestSource[];
};

export type Bm25Index = {
  totalDocs: number;
  avgDocLen: number;
  docLens: Record<string, number>;
  /** term -> [chunkId, termFrequency][] */
  postings: Record<string, Array<[string, number]>>;
};
