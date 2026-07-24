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

  it('normalizes NFD input to NFC so combining marks do not break words', () => {
    // \p{L} excludes combining marks, so NFD (base char + separate combining
    // diacritic) would otherwise shatter a word at every mark.
    expect(tokenize('Xin chào Việt Nam'.normalize('NFD'))).toEqual(['xin', 'chào', 'việt', 'nam']);
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
    // s1#0 and s2#0 both match 'visa' and 'letter' with identical tf (1) and
    // identical docLen (8 tokens each), so their BM25 scores are an exact
    // tie by construction — hence '>=' below is not vacuous but expected.
    // The next test covers a case with a genuine, strict score difference.
    const results = searchBm25(index, tokenize('visa letter'), 4);
    expect(results.length).toBeGreaterThanOrEqual(2);
    const ids = results.map((r) => r.chunkId);
    expect(ids.slice(0, 2)).toEqual(expect.arrayContaining(['s1#0', 's2#0']));
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('ranks a chunk matching an extra query term strictly higher', () => {
    // s1#0 matches all three terms (visa, letter, process); s2#0 matches
    // only two (visa, letter) — same docLen as s1#0, so the extra matched
    // term is what must break the tie, producing a strict (non-tied) order.
    const results = searchBm25(index, tokenize('visa letter process'), 4);
    expect(results[0].chunkId).toBe('s1#0');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('returns empty for no-match and empty queries', () => {
    expect(searchBm25(index, tokenize('quantum blockchain'), 5)).toEqual([]);
    expect(searchBm25(index, [], 5)).toEqual([]);
  });

  it('respects topK', () => {
    expect(searchBm25(index, tokenize('the visa letter process policy'), 2)).toHaveLength(2);
  });

  it('searches CJK content end-to-end (bigram tokens flow through build and search)', () => {
    const cjkCorpus = [chunk('c1#0', '知识库是共享的'), chunk('c2#0', '天气很好'), chunk('c3#0', '共享文件很有用')];
    const cjkIndex = buildBm25Index(cjkCorpus);
    const results = searchBm25(cjkIndex, tokenize('知识库'), 2);
    expect(results[0].chunkId).toBe('c1#0');
    expect(results[0].score).toBeGreaterThan(0);
  });
});
