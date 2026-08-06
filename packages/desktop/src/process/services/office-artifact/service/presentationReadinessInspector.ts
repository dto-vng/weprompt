/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { PRESENTATION_RUN_LIMITS } from '@/common/config/constants';
import type {
  PresentationReadinessBlocker,
  PresentationReadinessBlockerCode,
  PresentationReadinessPolicyEvidence,
  PresentationSlidePolicyEvidence,
  PresentationSlideRole,
} from '@/common/types/office/artifactReadiness';

import type { PptxOoxmlInspection } from './pptxOoxmlInspector';

export type PresentationReadinessInspectionInput = {
  readonly planBytes: Uint8Array;
  readonly knownSourceRefs: readonly string[];
  readonly ooxml: PptxOoxmlInspection;
};

type ParsedPlan = {
  valid: boolean;
  sourceRefsBySlide: string[][];
  blockers: PresentationReadinessBlocker[];
};

const MAX_EXEMPT_TEXT_CHARS = 160;
const MAX_QUOTE_TEXT_CHARS = 320;
const DIVIDER_TEXT_CHARS = 80;
const LITERAL_ESCAPE_RE = /\\(?:n|r|t|u[0-9a-f]{4})/i;
const PLACEHOLDER_RE = /(?:\{\{[^{}]+\}\}|\$\{[^{}]+\}|<<[^<>]+>>|\[(?:placeholder|insert|replace)[^\]]*\])/i;
const QUOTE_RE = /^(?:[\s\u2018\u2019]*[\u201c\u201d"]|[\s\u201c\u201d]*[\u2018\u2019'])/;
const CLOSING_RE = /^(?:thank\s+you|thanks|questions?|q\s*&\s*a|contact(?:\s+us)?)(?:\s|[.!?:-]|$)/i;

function blocker(code: PresentationReadinessBlockerCode, slideNumber: number | null): PresentationReadinessBlocker {
  return { code, slideNumber };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePlan(bytes: Uint8Array, slideCount: number, knownSourceRefs: ReadonlySet<string>): ParsedPlan {
  if (bytes.byteLength > PRESENTATION_RUN_LIMITS.MAX_PLAN_JSON_BYTES) {
    return {
      valid: false,
      sourceRefsBySlide: Array.from({ length: slideCount }, (): string[] => []),
      blockers: [blocker('PLAN_INVALID', null)],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return {
      valid: false,
      sourceRefsBySlide: Array.from({ length: slideCount }, (): string[] => []),
      blockers: [blocker('PLAN_INVALID', null)],
    };
  }

  if (!Array.isArray(value) || value.length !== slideCount) {
    return {
      valid: false,
      sourceRefsBySlide: Array.from({ length: slideCount }, (): string[] => []),
      blockers: [blocker('PLAN_INVALID', null)],
    };
  }

  let valid = true;
  const blockers: PresentationReadinessBlocker[] = [];
  const sourceRefsBySlide = value.map((entry, index): string[] => {
    const slideNumber = index + 1;
    if (!isRecord(entry) || !Object.hasOwn(entry, 'sourceRefs') || !Array.isArray(entry.sourceRefs)) {
      valid = false;
      blockers.push(blocker('PLAN_INVALID', slideNumber));
      return [];
    }

    if (
      entry.sourceRefs.length > PRESENTATION_RUN_LIMITS.MAX_SOURCE_REFS_PER_SLIDE ||
      !entry.sourceRefs.every((sourceRef) => typeof sourceRef === 'string')
    ) {
      valid = false;
      blockers.push(blocker('PLAN_INVALID', slideNumber));
      return [];
    }

    const sourceRefs = entry.sourceRefs as string[];
    if (new Set(sourceRefs).size !== sourceRefs.length) {
      valid = false;
      blockers.push(blocker('PLAN_INVALID', slideNumber));
      return [];
    }

    if (sourceRefs.some((sourceRef) => !knownSourceRefs.has(sourceRef))) {
      valid = false;
      blockers.push(blocker('SOURCE_REF_UNRESOLVED', slideNumber));
    }
    return sourceRefs.slice();
  });

  return { valid, sourceRefsBySlide, blockers };
}

function isOneBoundedTextShape(slide: PptxOoxmlInspection['slides'][number], maximumTextChars: number): boolean {
  const textLength = slide.text.trim().length;
  return (
    textLength > 0 &&
    textLength <= maximumTextChars &&
    slide.shapeCount === 1 &&
    slide.textOnlyShapeCount === 1 &&
    slide.visualAnchorKinds.length === 0
  );
}

function classifySlideRole(slide: PptxOoxmlInspection['slides'][number], slideCount: number): PresentationSlideRole {
  if (slide.slideNumber === 1) return 'cover';

  const normalizedText = slide.text.trim();
  if (
    slide.slideNumber === slideCount &&
    normalizedText.length > 0 &&
    normalizedText.length <= MAX_EXEMPT_TEXT_CHARS &&
    slide.shapeCount >= 1 &&
    slide.shapeCount <= 2 &&
    slide.textOnlyShapeCount === slide.shapeCount &&
    slide.visualAnchorKinds.length === 0 &&
    CLOSING_RE.test(normalizedText)
  ) {
    return 'closing';
  }

  if (isOneBoundedTextShape(slide, MAX_QUOTE_TEXT_CHARS) && QUOTE_RE.test(normalizedText)) return 'quote';

  const isMiddleSlide = slide.slideNumber > 1 && slide.slideNumber < slideCount;
  if (isMiddleSlide && isOneBoundedTextShape(slide, MAX_EXEMPT_TEXT_CHARS)) {
    return normalizedText.length <= DIVIDER_TEXT_CHARS ? 'divider' : 'minimal';
  }

  return 'content';
}

function sortAndDedupeBlockers(blockers: readonly PresentationReadinessBlocker[]): PresentationReadinessBlocker[] {
  const unique = new Map<string, PresentationReadinessBlocker>();
  for (const item of blockers) {
    unique.set(`${item.slideNumber ?? 'global'}\u0000${item.code}`, item);
  }
  return [...unique.values()].toSorted(
    (left, right) => (left.slideNumber ?? 0) - (right.slideNumber ?? 0) || left.code.localeCompare(right.code)
  );
}

function freezeEvidence(
  plan: PresentationReadinessPolicyEvidence['plan'],
  slides: PresentationSlidePolicyEvidence[],
  blockers: PresentationReadinessBlocker[]
): PresentationReadinessPolicyEvidence {
  const frozenPlan = Object.freeze({ ...plan });
  const frozenSlides = Object.freeze(
    slides.map((slide) => Object.freeze({ ...slide, sourceRefs: Object.freeze([...slide.sourceRefs]) }))
  );
  const frozenBlockers = Object.freeze(blockers.map((item) => Object.freeze({ ...item })));
  return Object.freeze({ version: 1, plan: frozenPlan, slides: frozenSlides, blockers: frozenBlockers });
}

/**
 * Applies deterministic presentation policy to bounded OOXML facts and a strict
 * ordered provenance plan. The result is evidence only and grants no authority.
 */
export function inspectPresentationReadiness(
  input: PresentationReadinessInspectionInput
): PresentationReadinessPolicyEvidence {
  const knownSourceRefs = new Set(input.knownSourceRefs);
  const parsedPlan = parsePlan(input.planBytes, input.ooxml.slideCount, knownSourceRefs);
  const blockers = [...parsedPlan.blockers];

  const slides = input.ooxml.slides.map(
    (slide: PptxOoxmlInspection['slides'][number], index: number): PresentationSlidePolicyEvidence => {
      const role = classifySlideRole(slide, input.ooxml.slideCount);
      if (LITERAL_ESCAPE_RE.test(slide.text)) blockers.push(blocker('LITERAL_ESCAPE_TOKEN', slide.slideNumber));
      if (PLACEHOLDER_RE.test(slide.text)) blockers.push(blocker('UNRESOLVED_PLACEHOLDER', slide.slideNumber));

      const requiresContentChecks = role === 'content';
      if (requiresContentChecks && slide.notesTextCharCount === 0) {
        blockers.push(blocker('REQUIRED_NOTES_MISSING', slide.slideNumber));
      }
      if (requiresContentChecks && slide.visualAnchorKinds.length === 0) {
        blockers.push(blocker('CONTENT_VISUAL_ANCHOR_MISSING', slide.slideNumber));
      }

      return {
        slideNumber: slide.slideNumber,
        role,
        sourceRefs: parsedPlan.sourceRefsBySlide[index] ?? [],
        requiresNotes: requiresContentChecks,
        requiresVisualAnchor: requiresContentChecks,
      };
    }
  );

  const sourceRefCount = parsedPlan.sourceRefsBySlide.reduce((total, sourceRefs) => total + sourceRefs.length, 0);
  return freezeEvidence(
    { valid: parsedPlan.valid, slideCount: parsedPlan.sourceRefsBySlide.length, sourceRefCount },
    slides,
    sortAndDedupeBlockers(blockers)
  );
}
