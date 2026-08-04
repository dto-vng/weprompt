/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { resolveRemoteMediaBudget } from '@process/services/remote-media';

describe('resolveRemoteMediaBudget', () => {
  it('uses the base budget when an image size is unknown', () => {
    expect(resolveRemoteMediaBudget({ mediaKind: 'image' })).toEqual({ timeoutMs: 120_000 });
  });

  it('uses the extended fallback when a video size is unknown', () => {
    expect(resolveRemoteMediaBudget({ mediaKind: 'video' })).toEqual({ timeoutMs: 900_000 });
  });

  it('adds transfer time for a known size without reducing the media fallback', () => {
    expect(resolveRemoteMediaBudget({ mediaKind: 'video', byteSize: 512 * 1024 * 1024 })).toEqual({
      timeoutMs: 1_144_000,
    });
  });

  it('caps the budget at thirty minutes', () => {
    expect(resolveRemoteMediaBudget({ mediaKind: 'video', byteSize: Number.MAX_SAFE_INTEGER })).toEqual({
      timeoutMs: 1_800_000,
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'ignores invalid optional size metadata: %s',
    (byteSize) => {
      expect(resolveRemoteMediaBudget({ mediaKind: 'video', byteSize })).toEqual({ timeoutMs: 900_000 });
    }
  );

  it.each([
    [1, 121_000],
    [512 * 1024, 121_000],
    [512 * 1024 + 1, 122_000],
  ])('rounds a known image size of %i bytes up to whole transfer seconds', (byteSize, timeoutMs) => {
    expect(resolveRemoteMediaBudget({ mediaKind: 'image', byteSize })).toEqual({ timeoutMs });
  });

  it('never decreases as a valid image size increases', () => {
    const sizes = [1, 512 * 1024, 512 * 1024 + 1, 256 * 1024 * 1024, Number.MAX_SAFE_INTEGER];
    const budgets = sizes.map((byteSize) => resolveRemoteMediaBudget({ mediaKind: 'image', byteSize }).timeoutMs);

    expect(budgets).toEqual(budgets.toSorted((left, right) => left - right));
  });
});
