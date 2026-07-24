/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildBm25Index, searchBm25, tokenize } from '@/common/knowledge/bm25';
import type { KnowledgeChunk } from '@/common/knowledge/types';

const chunk = (id: string, text: string): KnowledgeChunk => ({
  chunkId: id,
  sourceId: id.split('#')[0],
  chunkIndex: Number(id.split('#')[1]),
  text,
  hasVector: false,
});

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumerics, keeping diacritics', () => {
    expect(tokenize('Hello, World! Xin chào Việt-Nam 42')).toEqual([
      'hello',
      'world',
      'xin',
      'chào',
      'việt',
      'nam',
      '42',
    ]);
  });

  it('splits CJK runs into bigrams', () => {
    expect(tokenize('知识库')).toEqual(['知识', '识库']);
    expect(tokenize('a知识b')).toEqual(['a', '知识', 'b']);
    expect(tokenize('中')).toEqual(['中']);
  });
});

describe('bm25', () => {
  const corpus = [
    chunk('s1#0', 'visa letter process for business trips to Singapore'),
    chunk('s1#1', 'expense reports must be filed within thirty days'),
    chunk('s2#0', 'the visa application requires a letter from HR'),
    chunk('s2#1', 'office wifi password rotation policy'),
  ];
  const index = buildBm25Index(corpus);

  it('computes corpus stats', () => {
    expect(index.totalDocs).toBe(4);
    expect(Object.keys(index.docLens)).toHaveLength(4);
    expect(index.avgDocLen).toBeGreaterThan(0);
  });

  it('ranks documents containing more query terms higher', () => {
    const results = searchBm25(index, tokenize('visa letter'), 4);
    expect(results.length).toBeGreaterThanOrEqual(2);
    const ids = results.map((r) => r.chunkId);
    expect(ids.slice(0, 2)).toEqual(expect.arrayContaining(['s1#0', 's2#0']));
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('returns empty for no-match and empty queries', () => {
    expect(searchBm25(index, tokenize('quantum blockchain'), 5)).toEqual([]);
    expect(searchBm25(index, [], 5)).toEqual([]);
  });

  it('respects topK', () => {
    expect(searchBm25(index, tokenize('the visa letter process policy'), 2)).toHaveLength(2);
  });
});
