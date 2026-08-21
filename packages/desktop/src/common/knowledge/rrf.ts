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
  const ranked = [...scores.entries()]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .toSorted((a, b) => b.score - a.score);

  /**
   * Summing is the point of RRF — agreement between arms is evidence — but it
   * means a document present in every list outscores one present in a single
   * list however strongly that list ranks it: two terms of ~1/61 beat one.
   * Measured against a real store: a salary passage the semantic arm ranked
   * first scored 1/61, while a passage carrying the query's words but not its
   * answer scored 1/61 + 1/62, because the salary passage shared no vocabulary
   * with the query and so never entered the BM25 list at all.
   *
   * Surfacing what the lexical arm cannot find is the semantic arm's entire
   * purpose, so each arm's own best hit is guaranteed a place rather than being
   * truncated away. Relative order is untouched — this only decides what
   * survives `topN` — and with one non-empty list it is a no-op, since that
   * list's head already ranks first.
   */
  const kept = ranked.slice(0, topN);
  const heads = lists.map((list) => list[0]?.chunkId).filter((id): id is string => id !== undefined);
  for (const head of heads) {
    if (kept.some((hit) => hit.chunkId === head)) continue;
    const promoted = ranked.find((hit) => hit.chunkId === head);
    if (!promoted) continue;
    // Drop the weakest kept hit, never another arm's guaranteed head.
    const droppableIndex = kept
      .map((hit, index) => ({ hit, index }))
      .filter(({ hit }) => !heads.includes(hit.chunkId))
      .pop();
    if (droppableIndex === undefined) break;
    kept.splice(droppableIndex.index, 1);
    kept.push(promoted);
  }
  return kept.toSorted((a, b) => b.score - a.score);
};
