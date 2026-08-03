/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { fitStoryboardDurations } from '@process/services/creative-studio/planning';
import { describe, expect, it } from 'vitest';

type Item = Parameters<typeof fitStoryboardDurations>[0][number];

const item = (
  sceneId: string,
  currentDurationSeconds: number,
  minDurationSeconds = 1,
  maxDurationSeconds = 60
): Item => ({ sceneId, currentDurationSeconds, minDurationSeconds, maxDurationSeconds });

describe('fitStoryboardDurations', () => {
  it('fits the canonical 18-second storyboard to 15 seconds deterministically', () => {
    const result = fitStoryboardDurations(
      [item('scene-1', 3), item('scene-2', 5), item('scene-3', 5), item('scene-4', 5)],
      15
    );

    expect(result).toEqual({
      status: 'fitted',
      allocations: [
        { sceneId: 'scene-1', durationSeconds: 3 },
        { sceneId: 'scene-2', durationSeconds: 4 },
        { sceneId: 'scene-3', durationSeconds: 4 },
        { sceneId: 'scene-4', durationSeconds: 4 },
      ],
    });
  });

  it('honors independent bounds while redistributing after maximum saturation', () => {
    const result = fitStoryboardDurations(
      [item('short', 10, 1, 2), item('medium', 5, 3, 6), item('long', 5, 4, 12)],
      15
    );

    expect(result).toEqual({
      status: 'fitted',
      allocations: [
        { sceneId: 'short', durationSeconds: 2 },
        { sceneId: 'medium', durationSeconds: 6 },
        { sceneId: 'long', durationSeconds: 7 },
      ],
    });
  });

  it('starts at scene minimums and redistributes only remaining capacity', () => {
    const result = fitStoryboardDurations(
      [item('minimum-heavy', 1, 7, 9), item('weighted', 10, 1, 20), item('capped', 20, 1, 3)],
      18
    );

    expect(result).toEqual({
      status: 'fitted',
      allocations: [
        { sceneId: 'minimum-heavy', durationSeconds: 8 },
        { sceneId: 'weighted', durationSeconds: 7 },
        { sceneId: 'capped', durationSeconds: 3 },
      ],
    });
  });

  it.each([
    [5, 6, 15],
    [16, 6, 15],
  ])('rejects target %s outside the full bounds', (targetSeconds, minimumSeconds, maximumSeconds) => {
    expect(fitStoryboardDurations([item('scene-1', 5, 2, 5), item('scene-2', 7, 4, 10)], targetSeconds)).toEqual({
      status: 'unreachable',
      minimumSeconds,
      maximumSeconds,
    });
  });

  it('uses storyboard order to break equal fractional remainders', () => {
    const result = fitStoryboardDurations([item('first', 1, 1, 5), item('second', 1, 1, 5), item('third', 1, 1, 5)], 5);

    expect(result).toEqual({
      status: 'fitted',
      allocations: [
        { sceneId: 'first', durationSeconds: 2 },
        { sceneId: 'second', durationSeconds: 2 },
        { sceneId: 'third', durationSeconds: 1 },
      ],
    });
  });

  it.each([
    [6, [2, 2, 2]],
    [9, [2, 3, 4]],
    [15, [3, 5, 7]],
  ])('returns an exact bounded allocation for target %s', (targetSeconds, expected) => {
    const result = fitStoryboardDurations(
      [item('scene-1', 2, 2, 3), item('scene-2', 4, 2, 5), item('scene-3', 8, 2, 8)],
      targetSeconds
    );

    expect(result).toEqual({
      status: 'fitted',
      allocations: expected.map((durationSeconds, index) => ({
        sceneId: `scene-${index + 1}`,
        durationSeconds,
      })),
    });
  });

  it('normalizes an already-on-target input that violates a minimum bound', () => {
    const result = fitStoryboardDurations([item('invalid', 1, 3, 5), item('valid', 7, 1, 10)], 8);

    expect(result).toEqual({
      status: 'fitted',
      allocations: [
        { sceneId: 'invalid', durationSeconds: 4 },
        { sceneId: 'valid', durationSeconds: 4 },
      ],
    });
  });
});
