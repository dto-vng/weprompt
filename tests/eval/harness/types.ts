/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Shared types for the knowledge-base retrieval evaluation harness.

/** Retrieval knobs the harness can vary. See ../README.md for the two it cannot. */
export type EvalKnobs = {
  chunkChars: number;
  overlapChars: number;
  topK: number;
};

export type QuestionKind =
  | 'keyword-vn'
  | 'keyword-en'
  | 'nfd-corpus'
  | 'nfd-query'
  | 'distractor'
  | 'identifier'
  | 'semantic-only'
  | 'cross-language'
  | 'chunk-boundary'
  | 'unanswerable';

export type GoldenQuestion = {
  id: string;
  kind: QuestionKind;
  question: string;
  /** 'NFD' decomposes the query before it reaches retrieval. Default NFC. */
  queryForm?: 'NFC' | 'NFD';
  /** Empty means the corpus genuinely cannot answer this. */
  expectedSources: string[];
  /** Distinctive substring of the answer, used for passage-level scoring. */
  answerHint?: string;
  notes: string;
};

/**
 * Where a corpus document's text came from. 'ocr' documents are model
 * transcriptions of scans, which read differently from hand-authored markdown
 * — page markers instead of real section headings, and no text layer to fall
 * back on — so the distinction has to survive into the report.
 */
export type DocumentProvenance = 'authored' | 'ocr';

export type EvalDocument = {
  fileName: string;
  /** Exactly the bytes on disk, decoded as UTF-8 — normalisation form included. */
  text: string;
  provenance: DocumentProvenance;
};

export type EvalFixture = {
  documents: EvalDocument[];
  questions: GoldenQuestion[];
  /** Which corpus files are stored decomposed, for the report. */
  nfdFileNames: string[];
};

export type HitRecord = {
  sourceName: string;
  chunkIndex: number;
  score: number;
  headingPath?: string;
  /** Whether this hit's text contains the question's answerHint. */
  containsHint: boolean;
};

export type QuestionResult = {
  id: string;
  kind: QuestionKind;
  question: string;
  expectedSources: string[];
  answerHint?: string;
  hits: HitRecord[];
  /** 1-based rank of the first hit from an expected source; null if absent. */
  sourceRank: number | null;
  /** 1-based rank of the first expected-source hit containing answerHint. */
  answerRank: number | null;
  /**
   * Vector mode only: the rank in the UNTRUNCATED ranking, before the top-k cut.
   * The whole point of the diagnostic is the questions that miss, and a miss
   * measured at top-6 says only "not in the top 6" — the same non-answer the
   * fused run already gave. This is where the passage actually sat.
   */
  deepSourceRank?: number | null;
};

export type ModeMetrics = {
  /** Questions with at least one expected source — the ones recall is computed over. */
  scoredQuestions: number;
  /** Keyed by k; absent when k exceeds topK. */
  recallAt: Record<string, number>;
  answerRecallAt: Record<string, number>;
  /** Reciprocal rank of the first hit from an expected source. */
  mrr: number;
  /**
   * Reciprocal rank of the first passage that actually contains the answer.
   * More sensitive than mrr to chunking and overlap, which move the answer
   * between passages of the same file without changing which file wins.
   */
  answerMrr: number;
};

/**
 * 'vector' is a DIAGNOSTIC lens, not a shipping configuration — production is
 * always hybrid. It exists to answer one question the fused result cannot: when
 * hybrid misses, was the passage never found, or found and then buried by
 * fusion? For that reason it is reported but deliberately not baselined.
 */
export type EvalMode = 'bm25' | 'hybrid' | 'vector';

export type ModeResult = {
  mode: EvalMode;
  metrics: ModeMetrics;
  questions: QuestionResult[];
};

export type EmbeddingInfo = {
  model: string;
  dim: number;
  vectorCount: number;
  chunkCount: number;
  /** How the config was found, for the report. Never contains the API key. */
  source: 'env' | 'running-app';
  cacheHits: number;
  cacheMisses: number;
};

export type EvalRun = {
  knobs: EvalKnobs;
  /** `ocrDocumentCount` is a subset of `documentCount`, not an addition to it. */
  corpus: { documentCount: number; ocrDocumentCount: number; chunkCount: number };
  /** null when no embedding model was available — BM25-only run. */
  embedding: EmbeddingInfo | null;
  /** Why the hybrid half was skipped, when it was. */
  hybridSkippedReason: string | null;
  modes: ModeResult[];
};
