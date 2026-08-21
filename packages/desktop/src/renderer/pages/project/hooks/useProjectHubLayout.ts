/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Below this the two-column hub stops being usable, so it stacks.
 *
 * Derived from the layout rather than picked: 34px + 34px of hub padding, a
 * 356px rail and a 30px gap take 454px before the main column gets anything,
 * and the composer needs roughly 380px to keep its placeholder, model picker
 * and send button on one line. 380 + 454 = 834, rounded up.
 */
export const HUB_STACK_MAX_WIDTH = 840;

/**
 * BUG-058: the hub used to stack only on `layout.isMobile`, which on Electron
 * desktop is `window.innerWidth < 768` — a *window* measurement that ignores
 * the Sider. The Sider is user-resizable from 200px to 420px, so the width the
 * hub actually gets is `window − sider − 454`, and at the default Sider the
 * main column is already under 380px from a 1094px window down, with no stack
 * until 768px, where it computes to −46px and the grid falls back to
 * min-content. Measured live at an 880px window: a 77px New chat card.
 *
 * Measuring the hub itself removes the Sider from the arithmetic entirely.
 *
 * Two properties make this safe from feedback: the hub is a stretched flex item,
 * so its width is set by the shell and not by whether it stacks; and
 * `borderBoxSize` excludes the scrollbar that appears once stacking makes the
 * content taller, which `contentRect` would not.
 */
export const useProjectHubLayout = (): { hubRef: RefObject<HTMLDivElement | null>; isHubStacked: boolean } => {
  const hubRef = useRef<HTMLDivElement>(null);
  const [isHubStacked, setIsHubStacked] = useState(false);

  useLayoutEffect(() => {
    const hub = hubRef.current;
    if (hub === null) return;

    const update = (width: number): void => setIsHubStacked(width > 0 && width < HUB_STACK_MAX_WIDTH);
    update(hub.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === hub) ?? entries[0];
      if (entry === undefined) return;
      update(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
    });
    observer.observe(hub);
    return () => observer.disconnect();
  }, []);

  return { hubRef, isHubStacked };
};
