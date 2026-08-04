/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const BASE_TIMEOUT_MS = 120_000;
const UNKNOWN_VIDEO_TIMEOUT_MS = 15 * 60_000;
const MAX_TIMEOUT_MS = 30 * 60_000;
const MIN_RATE_BYTES_PER_SECOND = 512 * 1024;

export type RemoteMediaBudget = { timeoutMs: number };

export const resolveRemoteMediaBudget = ({
  byteSize,
  mediaKind,
}: {
  byteSize?: number;
  mediaKind: 'image' | 'video';
}): RemoteMediaBudget => {
  const fallbackMs = mediaKind === 'video' ? UNKNOWN_VIDEO_TIMEOUT_MS : BASE_TIMEOUT_MS;
  if (byteSize === undefined || !Number.isSafeInteger(byteSize) || byteSize <= 0) {
    return { timeoutMs: fallbackMs };
  }
  const transferMs = Math.ceil(byteSize / MIN_RATE_BYTES_PER_SECOND) * 1_000;
  return { timeoutMs: Math.min(MAX_TIMEOUT_MS, Math.max(fallbackMs, BASE_TIMEOUT_MS + transferMs)) };
};
