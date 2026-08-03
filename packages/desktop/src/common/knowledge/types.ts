/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Shared types for the per-project knowledge base. Node-free: safe to import
// from renderer type positions, though runtime knowledge modules (store,
// searchCore, …) are main-process/subprocess only.

export type KnowledgeSourceStatus = 'indexing' | 'ready' | 'failed' | 'unsupported';

/**
 * The ingestion phases slow enough to be worth reporting. Markdown conversion
 * and BM25 indexing are single opaque steps that finish in milliseconds, so
 * they have no progress to show and no stage of their own.
 *
 * `transcribing` is by far the slowest: one multimodal model call per page of a
 * scanned PDF, so a capped document takes minutes.
 */
export type KnowledgeIngestStage = 'reading' | 'transcribing' | 'embedding';

/** Live position within a stage, e.g. page 12 of 50. */
export type KnowledgeIngestProgress = {
  stage: KnowledgeIngestStage;
  done: number;
  total: number;
};

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
  /** Set while work is in flight; cleared once the source settles. */
  progress?: KnowledgeIngestProgress;
  /**
   * Present only when this source's text came from transcribing a scan rather
   * than from reading it. Provenance, and deliberately per-source rather than
   * pinned globally like `embedding`: transcription quality varies by document,
   * and re-transcribing one source with a different model must stay possible.
   */
  ocr?: KnowledgeOcrProvenance;
};

/** How a scanned source was transcribed, and what it cost in coverage. */
export type KnowledgeOcrProvenance = {
  /** The model that produced the text. Named so a bad transcription is traceable. */
  model: string;
  /** 1-based pages that produced no text and are therefore absent from the index. */
  skippedPages: number[];
};

export type KnowledgeManifest = {
  schemaVersion: 1;
  projectId: string;
  /** Pinned at first successful embed; null = BM25-only. */
  embedding: { model: string; dim: number } | null;
  sources: KnowledgeManifestSource[];
  /**
   * Set when the last folder sync could not read `Knowledge Base/` while
   * sources exist. An error state, NOT a deletion signal: the index is
   * preserved untouched until the folder becomes readable again.
   */
  folderMissing?: boolean;
};

export type Bm25Index = {
  totalDocs: number;
  avgDocLen: number;
  docLens: Record<string, number>;
  /** term -> [chunkId, termFrequency][] */
  postings: Record<string, Array<[string, number]>>;
};
