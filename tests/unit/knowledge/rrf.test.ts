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

  it('returns empty for no input', () => {
    expect(fuseRrf([[], []], 5)).toEqual([]);
  });
});
