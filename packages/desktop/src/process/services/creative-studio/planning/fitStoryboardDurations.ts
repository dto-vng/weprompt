/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type FitStoryboardDurationItem = {
  sceneId: string;
  currentDurationSeconds: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
};

export type FitStoryboardDurationsResult =
  | {
      status: 'fitted';
      allocations: Array<{ sceneId: string; durationSeconds: number }>;
    }
  | {
      status: 'unreachable';
      minimumSeconds: number;
      maximumSeconds: number;
    };

type WorkingAllocation = FitStoryboardDurationItem & {
  index: number;
  durationSeconds: number;
};

/** Allocates an integer target across independently bounded scenes. */
export function fitStoryboardDurations(
  items: readonly FitStoryboardDurationItem[],
  targetSeconds: number
): FitStoryboardDurationsResult {
  const minimumSeconds = items.reduce((total, item) => total + item.minDurationSeconds, 0);
  const maximumSeconds = items.reduce((total, item) => total + item.maxDurationSeconds, 0);
  if (targetSeconds < minimumSeconds || targetSeconds > maximumSeconds) {
    return { status: 'unreachable', minimumSeconds, maximumSeconds };
  }

  const allocations: WorkingAllocation[] = items.map((item, index) => ({
    ...item,
    index,
    durationSeconds: item.minDurationSeconds,
  }));
  let remainingSeconds = targetSeconds - minimumSeconds;
  let eligible = allocations.filter((item) => item.durationSeconds < item.maxDurationSeconds);

  while (remainingSeconds > 0 && eligible.length > 0) {
    const totalWeight = eligible.reduce((total, item) => total + Math.max(0, item.currentDurationSeconds), 0);
    const equalWeight = totalWeight === 0;
    const saturated = eligible.filter((item) => {
      const weight = equalWeight ? 1 : Math.max(0, item.currentDurationSeconds);
      const denominator = equalWeight ? eligible.length : totalWeight;
      const share = (remainingSeconds * weight) / denominator;
      return share >= item.maxDurationSeconds - item.durationSeconds;
    });

    if (saturated.length === 0) {
      for (const item of eligible) {
        const weight = equalWeight ? 1 : Math.max(0, item.currentDurationSeconds);
        const denominator = equalWeight ? eligible.length : totalWeight;
        item.durationSeconds += (remainingSeconds * weight) / denominator;
      }
      remainingSeconds = 0;
      break;
    }

    for (const item of saturated) {
      const capacity = item.maxDurationSeconds - item.durationSeconds;
      item.durationSeconds = item.maxDurationSeconds;
      remainingSeconds -= capacity;
    }
    eligible = eligible.filter((item) => !saturated.includes(item));
  }

  const floored = allocations.map((item) => ({
    ...item,
    fractionalRemainder: item.durationSeconds - Math.floor(item.durationSeconds),
    durationSeconds: Math.floor(item.durationSeconds),
  }));
  let leftoverSeconds = targetSeconds - floored.reduce((total, item) => total + item.durationSeconds, 0);
  const remainderOrder = [...floored].sort(
    (left, right) => right.fractionalRemainder - left.fractionalRemainder || left.index - right.index
  );
  for (const item of remainderOrder) {
    if (leftoverSeconds === 0) break;
    if (item.durationSeconds < item.maxDurationSeconds) {
      item.durationSeconds += 1;
      leftoverSeconds -= 1;
    }
  }

  return {
    status: 'fitted',
    allocations: floored.map(({ sceneId, durationSeconds }) => ({ sceneId, durationSeconds })),
  };
}
