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
 * `focus-visible` rather than `focus` so a mouse click does not leave a ring behind, and an
 * outline rather than a background so focus stays distinguishable from hover — a keyboard
 * user otherwise cannot tell where they are when the pointer happens to rest elsewhere.
 *
 * Written as one arbitrary property on purpose, for two reasons found by generating the CSS
 * and then checking the running app:
 *
 * 1. This project's Uno theme merges its numeric background scale into `theme.colors`, so
 *    the shorthand width utilities are hijacked into colours — `outline-1` compiles to
 *    `outline-color: var(--bg-1)` and `ring-2` to `--un-ring-color: var(--bg-2)`, neither
 *    of which sets a width. Declaring outline in full sidesteps that.
 * 2. A companion `focus-visible:bg-fill-3` was dropped rather than kept: the rule reached
 *    the stylesheet and `--color-fill-3` resolves on the row, yet the computed background
 *    stayed transparent on every row type with no competing `background` rule to explain
 *    it. Since it changed nothing on screen, keeping it would only have been dead CSS.
 */
export const ROW_FOCUS_RING = 'focus-visible:[outline:1px_solid_rgb(var(--primary-6))]';
