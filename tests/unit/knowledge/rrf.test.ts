/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { fuseRrf } from '@/common/knowledge/rrf';

describe('fuseRrf', () => {
  it('ranks items appearing high in both lists above single-list items', () => {
    const fused = fuseRrf(
      [
        [{ chunkId: 'a' }, { chunkId: 'b' }, { chunkId: 'c' }],
        [{ chunkId: 'b' }, { chunkId: 'd' }],
      ],
      10
    );
    expect(fused[0].chunkId).toBe('b'); // rank 2 + rank 1 beats everything
    expect(fused.map((f) => f.chunkId)).toContain('d');
    // no duplicates
    expect(new Set(fused.map((f) => f.chunkId)).size).toBe(fused.length);
  });

  it('degrades to the single list order when only one list is non-empty', () => {
    const fused = fuseRrf([[{ chunkId: 'x' }, { chunkId: 'y' }], []], 10);
    expect(fused.map((f) => f.chunkId)).toEqual(['x', 'y']);
  });

  it('respects topN and returns descending scores', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({ chunkId: `c${i}` }));
    const fused = fuseRrf([list], 3);
    expect(fused).toHaveLength(3);
    expect(fused[0].score).toBeGreaterThan(fused[2].score);
  });

  // Measured against a real store (BUG-056): the passage that answered the question
  // shared no vocabulary with the query, so it never entered the BM25 list and carried
  // one RRF term (1/61) against a lexical match's two (1/61 + 1/62). Summing is correct
  // — agreement is evidence — but the semantic arm exists precisely to surface what the
  // lexical arm cannot, so its best hit must not be truncated away.
  it("keeps each arm's best hit when topN would otherwise cut it", () => {
    // The measured shape from a real store: the answering passage shared no vocabulary
    // with the query, so BM25 never listed it, while both lexical matches appeared in
    // BOTH arms. Plain RRF scores them 0.0325 and 0.0320 against the answer's 0.0164,
    // so `topN: 2` cuts the only passage that answers the question.
    const fused = fuseRrf(
      [
        [{ chunkId: 'distractor' }, { chunkId: 'jobbrief' }],
        [{ chunkId: 'target' }, { chunkId: 'distractor' }, { chunkId: 'jobbrief' }],
      ],
      2
    );

    expect(fused).toHaveLength(2);
    expect(fused.map((f) => f.chunkId)).toContain('target');
    // The both-arms hit still leads: this changes what survives, not the order.
    expect(fused[0].chunkId).toBe('distractor');
  });

  it('does not displace one arm head to make room for another', () => {
    const fused = fuseRrf([[{ chunkId: 'a' }], [{ chunkId: 'b' }], [{ chunkId: 'c' }]], 2);

    // Three heads cannot fit in two slots; the two that fit are kept and no head
    // is evicted to admit a later one.
    expect(fused).toHaveLength(2);
    expect(fused.map((f) => f.chunkId)).toEqual(['a', 'b']);
  });

  it('returns empty for no input', () => {
    expect(fuseRrf([[], []], 5)).toEqual([]);
  });
});
