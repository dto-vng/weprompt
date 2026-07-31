/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KeyboardEvent } from 'react';

/**
 * Enter/Space activation for a row that must behave like a button but cannot be one.
 *
 * The sidebar rows carry absolutely-positioned overlays and `group-hover` children that
 * Arco's own `.arco-btn` display rule breaks, so they stay as divs and take button
 * semantics by hand. Space is included because a `role='button'` element is expected to
 * respond to it, and `preventDefault` stops Space from scrolling the sidebar.
 */
export const activateOnEnterOrSpace =
  (activate: () => void) =>
  (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate();
  };

/**
 * Focus treatment shared by every keyboard-reachable sidebar row.
 *
 * `focus-visible` rather than `focus` so a mouse click does not leave a ring behind. The
 * fill matches the row's own hover state so focus reads as the same affordance, and the
 * outline is what distinguishes focus from hover — without it a keyboard user cannot tell
 * where they are when the pointer happens to rest on a different row.
 *
 * The outline is written as one arbitrary property on purpose. This project's Uno theme
 * merges its numeric background scale into `theme.colors`, so the shorthand width
 * utilities are hijacked into colours: `outline-1` compiles to
 * `outline-color: var(--bg-1)` and `ring-2` to `--un-ring-color: var(--bg-2)`, neither of
 * which sets a width. Declaring outline in full sidesteps that entirely.
 */
export const ROW_FOCUS_RING = 'focus-visible:bg-fill-3 focus-visible:[outline:1px_solid_rgb(var(--primary-6))]';
