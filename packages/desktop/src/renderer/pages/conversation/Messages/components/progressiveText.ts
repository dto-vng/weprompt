/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Fraction of the remaining (not-yet-revealed) text to reveal each animation
// frame. Revealing a share of the backlog gives an ease-out feel: fast when the
// stream is far ahead of what's shown, gentle as it catches up — smoother than a
// fixed characters-per-tick typewriter.
export const REVEAL_CATCHUP_FRACTION = 0.18;

/**
 * Given how much text is currently shown and the full target length, return the
 * next revealed length for one animation frame. Always advances by at least one
 * character (so a reveal in progress always completes) and never overshoots the
 * target.
 */
export const nextRevealLength = (revealedLength: number, targetLength: number): number => {
  const remaining = targetLength - revealedLength;
  if (remaining <= 0) return Math.min(revealedLength, targetLength);
  const step = Math.max(1, Math.ceil(remaining * REVEAL_CATCHUP_FRACTION));
  return Math.min(targetLength, revealedLength + step);
};
