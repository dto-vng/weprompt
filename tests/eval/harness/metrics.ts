/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Aggregate metrics over per-question results.
//
// Two levels, because they fail differently:
//   recall@k       — was the expected *file* in the top k? What a citation needs.
//   answerRecall@k — did some returned passage from that file actually contain
//                    the answer? What the model needs. This is the one that
//                    moves when chunking or overlap changes.
//
// Unanswerable questions (no expected source) are excluded from both: the recall
// of an empty expected set is undefined, and folding them in would reward
// over-retrieval. They are reported separately instead.

import type { HitRecord, ModeMetrics, QuestionResult } from './types';

export const RECALL_KS = [1, 3, 6] as const;

const round4 = (value: number): number => Math.round(value * 10000) / 10000;

export const isScored = (question: QuestionResult): boolean => question.expectedSources.length > 0;

/** 1-based rank of the first hit satisfying `predicate`, or null. */
const rankOf = (hits: HitRecord[], predicate: (hit: HitRecord) => boolean): number | null => {
  const index = hits.findIndex(predicate);
  return index === -1 ? null : index + 1;
};

export const sourceRankOf = (hits: HitRecord[], expectedSources: string[]): number | null =>
  rankOf(hits, (hit) => expectedSources.includes(hit.sourceName));

export const answerRankOf = (hits: HitRecord[], expectedSources: string[]): number | null =>
  rankOf(hits, (hit) => expectedSources.includes(hit.sourceName) && hit.containsHint);

export const computeMetrics = (questions: QuestionResult[], topK: number): ModeMetrics => {
  const scored = questions.filter(isScored);
  const hinted = scored.filter((question) => Boolean(question.answerHint));

  const fractionWithin = (subset: QuestionResult[], k: number, pick: (q: QuestionResult) => number | null): number => {
    if (subset.length === 0) return 0;
    const within = subset.filter((question) => {
      const rank = pick(question);
      return rank !== null && rank <= k;
    }).length;
    return round4(within / subset.length);
  };

  const recallAt: Record<string, number> = {};
  const answerRecallAt: Record<string, number> = {};
  for (const k of RECALL_KS) {
    // A k above topK cannot be measured from a top-k result list; reporting it
    // as a number would silently understate recall during a --topk sweep.
    if (k > topK) continue;
    recallAt[String(k)] = fractionWithin(scored, k, (question) => question.sourceRank);
    answerRecallAt[String(k)] = fractionWithin(hinted, k, (question) => question.answerRank);
  }

  const meanReciprocal = (subset: QuestionResult[], pick: (q: QuestionResult) => number | null): number => {
    if (subset.length === 0) return 0;
    const total = subset.reduce((sum, question) => {
      const rank = pick(question);
      return sum + (rank === null ? 0 : 1 / rank);
    }, 0);
    return round4(total / subset.length);
  };

  return {
    scoredQuestions: scored.length,
    recallAt,
    answerRecallAt,
    mrr: meanReciprocal(scored, (question) => question.sourceRank),
    answerMrr: meanReciprocal(hinted, (question) => question.answerRank),
  };
};

/** Ids whose expected source was found at all — the set a regression must not shrink. */
export const foundIds = (questions: QuestionResult[]): string[] =>
  questions
    .filter((question) => isScored(question) && question.sourceRank !== null)
    .map((question) => question.id)
    .toSorted();
