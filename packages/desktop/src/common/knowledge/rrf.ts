/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Reciprocal Rank Fusion: score(d) = Σ_lists 1/(k + rank). Rank-only, so BM25
// and cosine lists fuse without score normalization, and an empty semantic
// list degrades to exactly the BM25 ranking. Pure — no Node APIs.

const RRF_K = 60;

export type RrfInput = { chunkId: string };
export type RrfResult = { chunkId: string; score: number };

export const fuseRrf = (lists: RrfInput[][], topN: number): RrfResult[] => {
  if (topN <= 0) return [];
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, i) => {
      scores.set(item.chunkId, (scores.get(item.chunkId) ?? 0) + 1 / (RRF_K + i + 1));
    });
  }
  return [...scores.entries()]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, topN);
};
