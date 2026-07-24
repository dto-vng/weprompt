/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Minimal BM25 (Okapi, k1=1.2 b=0.75) over knowledge chunks. Pure — no Node
// APIs. The tokenizer handles space-separated scripts (incl. Vietnamese
// diacritics) via unicode property classes and CJK runs via char bigrams.

import type { Bm25Index, KnowledgeChunk } from './types';

const K1 = 1.2;
const B = 0.75;
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
const CJK_SPLIT_RE = /([぀-ヿ㐀-䶿一-鿿豈-﫿]+)/u;

export const tokenize = (text: string): string[] => {
  const runs = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens: string[] = [];
  for (const run of runs) {
    for (const segment of run.split(CJK_SPLIT_RE)) {
      if (!segment) continue;
      if (CJK_RE.test(segment[0])) {
        const chars = [...segment];
        if (chars.length === 1) tokens.push(segment);
        else for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1]);
      } else {
        tokens.push(segment);
      }
    }
  }
  return tokens;
};

export const buildBm25Index = (chunks: KnowledgeChunk[]): Bm25Index => {
  const docLens: Record<string, number> = {};
  const postings: Record<string, Array<[string, number]>> = {};
  let totalLen = 0;
  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    docLens[chunk.chunkId] = tokens.length;
    totalLen += tokens.length;
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    for (const [term, count] of tf) {
      (postings[term] ??= []).push([chunk.chunkId, count]);
    }
  }
  const totalDocs = chunks.length;
  return { totalDocs, avgDocLen: totalDocs > 0 ? totalLen / totalDocs : 0, docLens, postings };
};

export type Bm25Result = { chunkId: string; score: number };

export const searchBm25 = (index: Bm25Index, queryTokens: string[], topK: number): Bm25Result[] => {
  if (index.totalDocs === 0 || queryTokens.length === 0) return [];
  const scores = new Map<string, number>();
  for (const term of new Set(queryTokens)) {
    const posting = index.postings[term];
    if (!posting) continue;
    const df = posting.length;
    const idf = Math.log(1 + (index.totalDocs - df + 0.5) / (df + 0.5));
    for (const [chunkId, tf] of posting) {
      const docLen = index.docLens[chunkId] ?? 0;
      const denom = tf + K1 * (1 - B + (B * docLen) / (index.avgDocLen || 1));
      scores.set(chunkId, (scores.get(chunkId) ?? 0) + (idf * (tf * (K1 + 1))) / denom);
    }
  }
  return [...scores.entries()]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, topK);
};
