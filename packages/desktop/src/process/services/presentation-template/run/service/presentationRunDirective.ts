/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import { PRESENTATION_RUN_DIRECTIVE_PREFIX, PRESENTATION_RUN_LIMITS } from '@/common/config/constants';

export type PresentationRunDirectiveInput = {
  themeFileName: string;
  referenceFileName: string;
  groundingFileName: string;
  candidatePath: string;
  planPath: string;
};

function containsPromptInjectionCharacter(value: string): boolean {
  if (value.includes('`')) return true;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint === 0x2028 || codePoint === 0x2029)
    ) {
      return true;
    }
  }
  return false;
}

function assertAttachedFileName(value: string): void {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 256 ||
    value.trim() !== value ||
    value.includes('/') ||
    value.includes('\\') ||
    containsPromptInjectionCharacter(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error('Invalid presentation run attachment name');
  }
}

function isNormalizedManagedPath(value: string): boolean {
  return (
    typeof value === 'string' &&
    path.isAbsolute(value) &&
    path.normalize(value) === value &&
    path.resolve(value) === value &&
    !containsPromptInjectionCharacter(value)
  );
}

function assertManagedPaths(candidatePath: string, planPath: string): void {
  if (
    !isNormalizedManagedPath(candidatePath) ||
    !isNormalizedManagedPath(planPath) ||
    path.basename(candidatePath) !== 'candidate.pptx' ||
    path.basename(planPath) !== 'plan.json' ||
    path.dirname(candidatePath) !== path.dirname(planPath) ||
    path.basename(path.dirname(candidatePath)) !== 'agent'
  ) {
    throw new Error('Invalid presentation run managed path');
  }
}

/** Builds the main-owned PPTX instruction used only by managed-v2 dispatch. */
export function buildPresentationRunDirective(input: PresentationRunDirectiveInput): string {
  assertAttachedFileName(input.themeFileName);
  assertAttachedFileName(input.referenceFileName);
  assertAttachedFileName(input.groundingFileName);
  if (input.groundingFileName !== 'grounding.md') {
    throw new Error('Invalid presentation run attachment name');
  }
  assertManagedPaths(input.candidatePath, input.planPath);

  return [
    PRESENTATION_RUN_DIRECTIVE_PREFIX,
    'Before editing, run `officecli load_skill pptx` and follow that skill.',
    `Read the selected \`${input.themeFileName}\` embedded in the attached \`${input.groundingFileName}\` in full.`,
    `The candidate was pre-cloned from the selected \`${input.referenceFileName}\` by the app. Edit only the allocated candidate at \`${input.candidatePath}\` in place with officecli.`,
    'Preserve the selected reference masters, layouts, typography, and slide chrome; never build a deck from scratch or write raw OOXML.',
    `Before finishing, write the slide-level provenance plan to \`${input.planPath}\` as JSON with exactly one entry per slide in slide order. Each entry must contain a \`sourceRefs\` array with at most ${PRESENTATION_RUN_LIMITS.MAX_SOURCE_REFS_PER_SLIDE} unique values, and every ref must be one of the supplied source grant ids.`,
    'The candidate is not a WePrompt-published or authorized managed workspace deliverable and always requires later review.',
    'These managed-run rules override any THEME instruction to save into the conversation workspace.',
    'Do not create an alternate final deck, save a final deck in the conversation workspace, or publish, install, rename, move, or copy the candidate elsewhere.',
    'Do not invent facts, numbers, citations, or source content.',
  ].join(' ');
}
