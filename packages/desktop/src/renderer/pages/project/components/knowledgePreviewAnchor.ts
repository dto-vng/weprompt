/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveAnchorHeadingText } from '@/common/knowledge/citationFormat';

/**
 * Locate the preview heading a citation anchor points at, inside the drawer's
 * rendered markdown container (which lives in a shadow root — callers pass the
 * in-shadow element, so plain querySelectorAll works). Exact trimmed-text
 * match only; no match means "open at top", never an error.
 */
export const findCitationHeading = (container: ParentNode, anchor: string): HTMLElement | null => {
  const target = resolveAnchorHeadingText(anchor);
  if (!target) return null;
  const headings = container.querySelectorAll('h1,h2,h3,h4,h5,h6');
  for (const heading of headings) {
    if ((heading.textContent ?? '').trim() === target) return heading as HTMLElement;
  }
  return null;
};
