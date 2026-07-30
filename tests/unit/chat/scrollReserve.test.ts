/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { computeReservedSpace } from '@/renderer/pages/conversation/Messages/scrollReserve';

describe('computeReservedSpace', () => {
  it('reserves a full viewport when the reply is empty', () => {
    expect(computeReservedSpace(800, 0)).toBe(800);
  });

  it('shrinks the reserve as real content fills the viewport', () => {
    expect(computeReservedSpace(800, 300)).toBe(500);
    expect(computeReservedSpace(800, 799)).toBe(1);
  });

  it('reserves nothing once content reaches or exceeds a viewport', () => {
    expect(computeReservedSpace(800, 800)).toBe(0);
    expect(computeReservedSpace(800, 1200)).toBe(0);
  });

  it('never returns a negative reserve', () => {
    expect(computeReservedSpace(800, 5000)).toBe(0);
  });

  it('clamps a negative measured content height to zero (reserve full viewport)', () => {
    expect(computeReservedSpace(800, -50)).toBe(800);
  });

  it('reserves nothing when there is no viewport', () => {
    expect(computeReservedSpace(0, 0)).toBe(0);
  });
});
