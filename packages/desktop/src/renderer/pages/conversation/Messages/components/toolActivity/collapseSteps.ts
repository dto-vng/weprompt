/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Collapse consecutive steps that render identically (same label + status) into a
 * single row.
 *
 * Agents that don't emit distinct plan/thinking narration fall back to a generic
 * per-step label, which otherwise produces long runs of the same line (e.g. nine
 * "Finished the next step." rows). Non-adjacent repeats are kept, since an
 * alternating pattern still conveys real sequence.
 */
export const collapseAdjacentSteps = <T extends { label: string; status: string }>(steps: T[]): T[] => {
  const collapsed: T[] = [];
  for (const step of steps) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && previous.label === step.label && previous.status === step.status) continue;
    collapsed.push(step);
  }
  return collapsed;
};
