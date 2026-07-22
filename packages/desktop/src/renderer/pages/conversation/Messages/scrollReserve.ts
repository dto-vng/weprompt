/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * How much empty space to reserve below the latest user message so the streamed
 * reply can fill it without the viewport moving.
 *
 * We keep at least one viewport of (real content + reserved space) below the
 * anchor: when the reply is short the spacer fills the gap so the user message
 * can sit at the top of the viewport; as the reply grows past a viewport the
 * spacer shrinks to zero. Never negative.
 *
 * @param viewportHeight        the scroller's clientHeight
 * @param contentHeightBelowAnchor  real content height from the anchor's top to
 *   the end of the messages (EXCLUDING the reserved spacer)
 */
export const computeReservedSpace = (viewportHeight: number, contentHeightBelowAnchor: number): number => {
  const belowAnchor = Math.max(0, contentHeightBelowAnchor);
  return Math.max(0, viewportHeight - belowAnchor);
};
