/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const OVERRIDES = readFileSync(
  resolve(__dirname, '../../../packages/desktop/src/renderer/styles/arco-override.css'),
  'utf8'
);
const TITLEBAR = readFileSync(
  resolve(__dirname, '../../../packages/desktop/src/renderer/components/layout/Titlebar/titlebar.css'),
  'utf8'
);

/**
 * The window is `titleBarStyle: 'hidden'` and the app paints its own titlebar,
 * marked draggable across the full window width — measured live at 1209x46. The
 * OS consumes a drag region for window-dragging before the DOM sees the click,
 * so any control Arco renders into a body-level portal that lands in that band
 * is unclickable with a real mouse.
 *
 * This is invisible to every automated check available here: `elementFromPoint`
 * returns the control, synthetic clicks activate it, and CDP input injects below
 * the OS layer. It reproduces only for a person using the app — a knowledge
 * preview whose close icon sat at y=24 did nothing on click while Escape and a
 * mask click, both outside the band, closed it normally.
 *
 * jsdom resolves no CSS here, so the rule is pinned as a source contract. That
 * is weaker than a rendered assertion, and it is the strongest guard this layer
 * can offer.
 */
describe('Arco portals opt out of the titlebar drag region', () => {
  it('still marks the desktop titlebar draggable', () => {
    // The bug is not that dragging exists — removing it would be the wrong fix.
    expect(TITLEBAR).toMatch(/\.app-titlebar--desktop\s*\{[^}]*-webkit-app-region:\s*drag/);
  });

  it.each([
    '.arco-drawer',
    '.arco-modal',
    '.arco-popover-content',
    '.arco-dropdown',
    '.arco-select-popup',
    '.arco-tooltip-content',
    '.arco-message',
    '.arco-notification',
  ])('opts %s out so its controls stay clickable under the titlebar', (selector) => {
    const rule = OVERRIDES.slice(OVERRIDES.indexOf('-webkit-app-region: no-drag') - 400);

    expect(rule).toContain(selector);
    expect(rule).toMatch(/-webkit-app-region:\s*no-drag/);
  });

  it('opts out the panels, never the full-screen wrappers', () => {
    // A wrapper covers the viewport while open, so opting it out would make the
    // titlebar undraggable whenever a drawer or modal is on screen. Each panel
    // above is 0x0 while closed, so the opt-out costs nothing until one shows.
    expect(OVERRIDES).not.toMatch(/\.arco-drawer-wrapper[^{]*\{[^}]*app-region/);
    expect(OVERRIDES).not.toMatch(/\.arco-modal-wrapper[^{]*\{[^}]*app-region/);
  });
});
