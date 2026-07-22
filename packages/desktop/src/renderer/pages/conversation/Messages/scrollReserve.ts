/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * How much empty space to reserve below the latest user message so the streamed
 * reply can fill it without the viewport moving.
 *
 * We keep `targetBelowHeight` of (real content + reserved space) below the
 * anchor — a fraction of the viewport chosen by the caller (the anchor sits a
 * little below the top, so the space it needs below is less than a full
 * viewport). When the reply is short the spacer fills the gap so the anchor can
 * hold its position; as the reply grows past the target the spacer shrinks to
 * zero. Never negative.
 *
 * @param targetBelowHeight  how much space to keep below the anchor (px)
 * @param contentHeightBelowAnchor  real content height from the anchor's top to
 *   the end of the messages (EXCLUDING the reserved spacer)
 */
export const computeReservedSpace = (targetBelowHeight: number, contentHeightBelowAnchor: number): number => {
  const belowAnchor = Math.max(0, contentHeightBelowAnchor);
  return Math.max(0, targetBelowHeight - belowAnchor);
};
