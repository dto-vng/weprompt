/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const COMPACT_MAX_WIDTH = 820;
const INLINE_ASSISTANT_MIN_WIDTH = 1120;

export type StudioLayoutMode = 'inline' | 'drawer' | 'compact';

export type StudioLayoutModeResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  layoutMode: StudioLayoutMode;
};

/** Uses the rendered phase width, not the viewport, to choose the assistant presentation. */
export const useStudioLayoutMode = (projectId: string): StudioLayoutModeResult => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<StudioLayoutMode>('compact');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const update = (width: number): void => {
      setLayoutMode(width > INLINE_ASSISTANT_MIN_WIDTH ? 'inline' : width <= COMPACT_MAX_WIDTH ? 'compact' : 'drawer');
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
