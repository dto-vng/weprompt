/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TurnWorkRecap, TurnWorkRecapStatus } from './buildTurnWorkRecap';

export type TurnCloseTone = 'neutral' | 'attention';

export type TurnClose = {
  // i18n key under messages.*; resolved by the component with useTranslation().
  key: string;
  tone: TurnCloseTone;
};

// Multiple variants per status keep the close from feeling same-y over time.
const CLOSE_VARIANTS: Record<Exclude<TurnWorkRecapStatus, 'active'>, string[]> = {
  completed: ['completed.v1', 'completed.v2', 'completed.v3'],
  recovered: ['recovered.v1', 'recovered.v2'],
  partial: ['partial.v1', 'partial.v2'],
  failed: ['failed.v1', 'failed.v2'],
  canceled: ['canceled.v1'],
};

const CLOSE_TONE: Record<Exclude<TurnWorkRecapStatus, 'active'>, TurnCloseTone> = {
  completed: 'neutral',
  recovered: 'neutral',
  partial: 'attention',
  failed: 'attention',
  canceled: 'neutral',
};

// Small deterministic hash so re-renders of the same turn pick the same variant.
const stableHash = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

export const buildTurnClose = (recap: TurnWorkRecap, subject?: string): TurnClose | null => {
  // No sign-off while the work is still streaming.
  if (recap.status === 'active') return null;

  // A single successful action needs no recap — the agent's own reply already says it.
  // Anything with a snag (failed/canceled) or a stated focus is worth closing.
  const isTrivial = recap.total <= 1 && recap.failed === 0 && recap.canceled === 0 && !subject;
  if (isTrivial && recap.status === 'completed') return null;

  const variants = CLOSE_VARIANTS[recap.status];
  const seed = `${recap.status}:${recap.total}:${subject ?? ''}`;
  const variant = variants[stableHash(seed) % variants.length];

  return { key: `messages.toolActivity.close.${variant}`, tone: CLOSE_TONE[recap.status] };
};
