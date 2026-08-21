/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HUB_STACK_MAX_WIDTH, useProjectHubLayout } from '@renderer/pages/project/hooks/useProjectHubLayout';

type ObserverCallback = (entries: ResizeObserverEntry[]) => void;

const measured = { width: 1200 };
let observerCallbacks: ObserverCallback[] = [];
const realResizeObserver = global.ResizeObserver;

const Probe: React.FC = () => {
  const { hubRef, isHubStacked } = useProjectHubLayout();
  return (
    <div ref={hubRef} data-testid='probe' data-stacked={isHubStacked ? 'yes' : 'no'}>
      hub
    </div>
  );
};

const stacked = () => screen.getByTestId('probe').dataset.stacked;

/** Fires the observer the way the browser would, with a border-box size. */
const resizeTo = (inlineSize: number, contentWidth = inlineSize) => {
  const target = screen.getByTestId('probe');
  act(() => {
    for (const callback of observerCallbacks) {
      callback([
        {
          target,
          borderBoxSize: [{ inlineSize, blockSize: 0 }],
          contentRect: { width: contentWidth } as DOMRectReadOnly,
        } as unknown as ResizeObserverEntry,
      ]);
    }
  });
};

beforeEach(() => {
  observerCallbacks = [];
  measured.width = 1200;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: measured.width,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
  );
  global.ResizeObserver = class {
    constructor(callback: ObserverCallback) {
      observerCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
  global.ResizeObserver = realResizeObserver;
});

/**
 * BUG-058: the hub stacked only on `layout.isMobile`, which on Electron desktop
 * is `window.innerWidth < 768`. The grid does not live at window width — the
 * Sider takes 200-420px first — so at the default Sider the main column was
 * already under 380px from a 1094px window down and still had not stacked at
 * 768px, where it computes to -46px. Measured live at an 880px window: a 77px
 * New chat card holding a 43px composer.
 */
describe('useProjectHubLayout', () => {
  it('stacks when the hub itself is measured below the threshold', () => {
    measured.width = HUB_STACK_MAX_WIDTH - 1;
    render(<Probe />);

    expect(stacked()).toBe('yes');
  });

  it('keeps two columns exactly at the threshold', () => {
    measured.width = HUB_STACK_MAX_WIDTH;
    render(<Probe />);

    expect(stacked()).toBe('no');
  });

  it('stacks when a later resize crosses the threshold, and recovers on the way back', () => {
    render(<Probe />);
    expect(stacked()).toBe('no');

    resizeTo(600);
    expect(stacked()).toBe('yes');

    resizeTo(1100);
    expect(stacked()).toBe('no');
  });

  /**
   * Stacking makes the hub taller, which raises a vertical scrollbar, which
   * narrows `contentRect` — feeding that back in could flip the layout on its
   * own output. The border box excludes the scrollbar, so it cannot oscillate.
   */
  it('measures the border box, not the scrollbar-narrowed content box', () => {
    render(<Probe />);

    resizeTo(HUB_STACK_MAX_WIDTH + 5, HUB_STACK_MAX_WIDTH - 10);

    expect(stacked()).toBe('no');
  });

  it('does not stack on a zero width, so an unmeasured hub is not flashed into one column', () => {
    measured.width = 0;
    render(<Probe />);

    expect(stacked()).toBe('no');
  });
});
