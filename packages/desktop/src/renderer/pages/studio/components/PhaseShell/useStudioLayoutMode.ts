/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const INLINE_ASSISTANT_MIN_WIDTH = 1120;

export type StudioLayoutMode = 'inline' | 'drawer';

export type StudioLayoutModeResult = {
  containerRef: RefObject<HTMLElement | null>;
  layoutMode: StudioLayoutMode;
};

/** Uses the rendered phase width, not the viewport, to choose the assistant presentation. */
export const useStudioLayoutMode = (projectId: string): StudioLayoutModeResult => {
  const containerRef = useRef<HTMLElement>(null);
  const [layoutMode, setLayoutMode] = useState<StudioLayoutMode>('drawer');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const update = (width: number): void => {
      setLayoutMode(width >= INLINE_ASSISTANT_MIN_WIDTH ? 'inline' : 'drawer');
    };
    update(container.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === container) ?? entries[0];
      if (entry !== undefined) update(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [projectId]);

  return { containerRef, layoutMode };
};
