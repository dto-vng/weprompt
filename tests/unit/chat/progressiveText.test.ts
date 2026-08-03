/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  REVEAL_CATCHUP_FRACTION,
  nextRevealLength,
} from '@/renderer/pages/conversation/Messages/components/progressiveText';

describe('nextRevealLength', () => {
  it('stays put when already caught up', () => {
    expect(nextRevealLength(0, 0)).toBe(0);
    expect(nextRevealLength(5, 5)).toBe(5);
  });

  it('never overshoots the target (even if shown is ahead)', () => {
    expect(nextRevealLength(6, 5)).toBe(5);
    expect(nextRevealLength(99, 100)).toBe(100);
  });

  it('eases: reveals a fraction of the backlog, not all of it', () => {
    const next = nextRevealLength(0, 100);
    expect(next).toBe(Math.ceil(100 * REVEAL_CATCHUP_FRACTION));
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
  });

  it('always advances by at least one character so a reveal completes', () => {
    // remaining = 2 → ceil(2 * 0.18) = 1
    expect(nextRevealLength(98, 100)).toBe(99);
  });

  it('converges to the target monotonically and in finite steps', () => {
    let shown = 0;
    const target = 5000;
    let steps = 0;
    let previous = -1;
    while (shown < target) {
      const next = nextRevealLength(shown, target);
      expect(next).toBeGreaterThan(previous);
      expect(next).toBeLessThanOrEqual(target);
      previous = shown;
      shown = next;
      steps += 1;
      expect(steps).toBeLessThan(target); // guaranteed to terminate well before 1-per-step worst case
    }
    expect(shown).toBe(target);
  });
});
