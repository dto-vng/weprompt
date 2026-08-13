/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import CollapsibleContent from '@/renderer/components/chat/CollapsibleContent';
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({ useThemeContext: () => ({ theme: 'light' }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CollapsibleContent height measurement', () => {
  // jsdom computes no layout and has no ResizeObserver, so the behaviour this guards
  // (does the observer fire when content grows?) cannot be asserted here — that is exactly
  // why the dead observer went unnoticed. What IS assertable is the structure the fix
  // depends on: an unclamped wrapper between the clamped box and the children, which is
  // what the observer watches. Verified in a real browser separately.
  it('keeps an unclamped wrapper between the clamped box and the children', () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(el: Element) {
          observed.push(el);
        }
        unobserve() {}
        disconnect() {}
      }
    );

    const { container } = render(
      <CollapsibleContent maxHeight={160}>
        <p>content</p>
      </CollapsibleContent>
    );

    const clamped = container.querySelector('[style*="max-height"]') as HTMLElement;
    expect(clamped).toBeTruthy();

    const wrapper = clamped.firstElementChild as HTMLElement;
    expect(wrapper?.tagName).toBe('DIV');
    // The wrapper must carry no height constraint of its own, or observing it is pointless.
    expect(wrapper.getAttribute('style')).toBeNull();
    expect(wrapper.textContent).toBe('content');

    // Both boxes are observed: the wrapper for content growth, the clamped box for width.
    expect(observed).toContain(wrapper);
    expect(observed).toContain(clamped);

    vi.unstubAllGlobals();
  });
});
