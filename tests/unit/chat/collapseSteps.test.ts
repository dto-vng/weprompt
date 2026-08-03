/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { collapseAdjacentSteps } from '@/renderer/pages/conversation/Messages/components/toolActivity/collapseSteps';

const step = (key: string, label: string, status = 'completed') => ({ key, label, status });

describe('collapseAdjacentSteps', () => {
  it('returns an empty list unchanged', () => {
    expect(collapseAdjacentSteps([])).toEqual([]);
  });

  it('collapses a run of identical label + status into one (keeping the first)', () => {
    const steps = [
      step('a', 'Finished the next step.'),
      step('b', 'Finished the next step.'),
      step('c', 'Finished the next step.'),
    ];
    expect(collapseAdjacentSteps(steps)).toEqual([step('a', 'Finished the next step.')]);
  });

  it('keeps distinct adjacent labels', () => {
    const steps = [step('a', 'Finished the next step.'), step('b', 'Reviewed the relevant files.')];
    expect(collapseAdjacentSteps(steps)).toEqual(steps);
  });

  it('does not collapse the same label with a different status (e.g. a running step)', () => {
    const steps = [step('a', 'Finished the next step.', 'completed'), step('b', 'Finished the next step.', 'running')];
    expect(collapseAdjacentSteps(steps)).toEqual(steps);
  });

  it('keeps non-adjacent repeats so an alternating sequence is preserved', () => {
    const steps = [step('a', 'X'), step('b', 'Y'), step('c', 'X')];
    expect(collapseAdjacentSteps(steps)).toEqual(steps);
  });

  it('collapses the real-world case: 9 generic + 2 file reviews to 2 rows', () => {
    const steps = [
      ...Array.from({ length: 9 }, (_unused, i) => step(`g${i}`, 'Finished the next step.')),
      step('f0', 'Reviewed the relevant files.'),
      step('f1', 'Reviewed the relevant files.'),
    ];
    const collapsed = collapseAdjacentSteps(steps);
    expect(collapsed.map((s) => s.label)).toEqual(['Finished the next step.', 'Reviewed the relevant files.']);
    expect(collapsed.map((s) => s.key)).toEqual(['g0', 'f0']);
  });
});
