/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import type { PptxOoxmlInspection } from '@/process/services/office-artifact/service/pptxOoxmlInspector';
import { inspectPresentationReadiness } from '@/process/services/office-artifact/service/presentationReadinessInspector';

const encoder = new TextEncoder();

function planBytes(sourceRefsBySlide: readonly (readonly string[])[], extra: Record<string, unknown> = {}): Uint8Array {
  return encoder.encode(
    JSON.stringify(sourceRefsBySlide.map((sourceRefs) => ({ sourceRefs: [...sourceRefs], ...extra })))
  );
}

function slide(
  slideNumber: number,
  overrides: Partial<PptxOoxmlInspection['slides'][number]> = {}
): PptxOoxmlInspection['slides'][number] {
  return {
    slideNumber,
    shapeCount: 2,
    textCharCount: 32,
    textOnlyShapeCount: 2,
    notesTextCharCount: 20,
    text: `Slide ${slideNumber} title\nSlide ${slideNumber} body`,
    visualAnchorKinds: ['chart'],
    ...overrides,
  };
}

function ooxml(slides: readonly PptxOoxmlInspection['slides'][number][]): PptxOoxmlInspection {
  return {
    zipEntryCount: 12,
    expandedByteLength: 4_096,
    xmlByteLength: 2_048,
    slideCount: slides.length,
    totalTextChars: slides.reduce((total, item) => total + item.textCharCount, 0),
    slides,
  };
}

describe('inspectPresentationReadiness', () => {
  it('returns deeply frozen path-free evidence for a valid ordered plan', () => {
    const inspection = ooxml([
      slide(1, {
        shapeCount: 1,
        textOnlyShapeCount: 1,
        notesTextCharCount: 0,
        text: 'Quarterly review',
        textCharCount: 16,
        visualAnchorKinds: [],
      }),
      slide(2),
      slide(3, {
        shapeCount: 1,
        textOnlyShapeCount: 1,
        notesTextCharCount: 0,
        text: 'Thank you',
        textCharCount: 9,
        visualAnchorKinds: [],
      }),
    ]);

    const evidence = inspectPresentationReadiness({
      planBytes: planBytes([['source-a'], ['source-a', 'source-b'], []], { rationale: 'ignored' }),
      knownSourceRefs: ['source-a', 'source-b'],
      ooxml: inspection,
    });

    expect(evidence).toEqual({
      version: 1,
      plan: { valid: true, slideCount: 3, sourceRefCount: 3 },
      slides: [
        {
          slideNumber: 1,
          role: 'cover',
          sourceRefs: ['source-a'],
          requiresNotes: false,
          requiresVisualAnchor: false,
        },
        {
          slideNumber: 2,
          role: 'content',
          sourceRefs: ['source-a', 'source-b'],
          requiresNotes: true,
          requiresVisualAnchor: true,
        },
        {
          slideNumber: 3,
          role: 'closing',
          sourceRefs: [],
          requiresNotes: false,
          requiresVisualAnchor: false,
        },
      ],
      blockers: [],
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.plan)).toBe(true);
    expect(Object.isFrozen(evidence.slides)).toBe(true);
    expect(Object.isFrozen(evidence.slides[1])).toBe(true);
    expect(Object.isFrozen(evidence.slides[1].sourceRefs)).toBe(true);
    expect(Object.isFrozen(evidence.blockers)).toBe(true);
    expect(JSON.stringify(evidence)).not.toMatch(/path|ready|phase|disposition|openAllowed/i);
  });

  it('rejects the structurally valid WMS-shaped deck without scoring repeated composition', () => {
    const slides = Array.from({ length: 11 }, (_, index) =>
      slide(index + 1, {
        notesTextCharCount: 0,
        text: `Repeated title\\nRepeated body ${index + 1}`,
        textCharCount: 37,
        visualAnchorKinds: [],
      })
    );

    const evidence = inspectPresentationReadiness({
      planBytes: planBytes(slides.map(() => ['wms-source'])),
      knownSourceRefs: ['wms-source'],
      ooxml: ooxml(slides),
    });

    expect(evidence.plan.valid).toBe(true);
    expect(evidence.slides.map(({ role }) => role)).toEqual(['cover', ...Array(10).fill('content')]);
    expect(new Set(evidence.blockers.map(({ code }) => code))).toEqual(
      new Set(['LITERAL_ESCAPE_TOKEN', 'REQUIRED_NOTES_MISSING', 'CONTENT_VISUAL_ANCHOR_MISSING'])
    );
    expect(evidence.blockers).toHaveLength(31);
    expect(evidence.blockers).toEqual(
      evidence.blockers.toSorted(
        (left, right) => (left.slideNumber ?? 0) - (right.slideNumber ?? 0) || left.code.localeCompare(right.code)
      )
    );
  });

  it('classifies only bounded one-shape exemptions and keeps title-plus-body slides as content', () => {
    const inspection = ooxml([
      slide(1, { shapeCount: 1, textOnlyShapeCount: 1, text: 'Cover', textCharCount: 5 }),
      slide(2, {
        shapeCount: 1,
        textOnlyShapeCount: 1,
        notesTextCharCount: 0,
        text: 'Operations',
        textCharCount: 10,
        visualAnchorKinds: [],
      }),
      slide(3, {
        shapeCount: 1,
        textOnlyShapeCount: 1,
        notesTextCharCount: 0,
        text: '“Measure twice, cut once.”',
        textCharCount: 26,
        visualAnchorKinds: [],
      }),
      slide(4, {
        shapeCount: 2,
        textOnlyShapeCount: 2,
        notesTextCharCount: 0,
        text: 'Title\nBody',
        textCharCount: 10,
        visualAnchorKinds: [],
      }),
      slide(5, {
        shapeCount: 1,
        textOnlyShapeCount: 1,
        notesTextCharCount: 0,
        text: 'A'.repeat(100),
        textCharCount: 100,
        visualAnchorKinds: [],
      }),
      slide(6, {
        shapeCount: 1,
        textOnlyShapeCount: 1,
        notesTextCharCount: 0,
        text: 'A'.repeat(161),
        textCharCount: 161,
        visualAnchorKinds: [],
      }),
      slide(7, {
        shapeCount: 1,
        textOnlyShapeCount: 1,
        notesTextCharCount: 0,
        text: 'Questions?',
        textCharCount: 10,
        visualAnchorKinds: [],
      }),
    ]);

    const evidence = inspectPresentationReadiness({
      planBytes: planBytes(inspection.slides.map(() => [])),
      knownSourceRefs: [],
      ooxml: inspection,
    });

    expect(evidence.slides.map(({ role }) => role)).toEqual([
      'cover',
      'divider',
      'quote',
      'content',
      'minimal',
      'content',
      'closing',
    ]);
    expect(evidence.blockers).toEqual([
      { code: 'CONTENT_VISUAL_ANCHOR_MISSING', slideNumber: 4 },
      { code: 'REQUIRED_NOTES_MISSING', slideNumber: 4 },
      { code: 'CONTENT_VISUAL_ANCHOR_MISSING', slideNumber: 6 },
      { code: 'REQUIRED_NOTES_MISSING', slideNumber: 6 },
    ]);
  });

  it('reports literal escapes and explicit unresolved placeholder tokens once per slide', () => {
    const inspection = ooxml([
      slide(1, { text: 'Cover {{customer_name}}\\n', textCharCount: 25 }),
      slide(2, { text: 'Body ${metric} and <<owner>> and {{metric}}\\n\\n', textCharCount: 48 }),
    ]);

    const evidence = inspectPresentationReadiness({
      planBytes: planBytes([[], []]),
      knownSourceRefs: [],
      ooxml: inspection,
    });

    expect(evidence.blockers).toEqual([
      { code: 'LITERAL_ESCAPE_TOKEN', slideNumber: 1 },
      { code: 'UNRESOLVED_PLACEHOLDER', slideNumber: 1 },
      { code: 'LITERAL_ESCAPE_TOKEN', slideNumber: 2 },
      { code: 'UNRESOLVED_PLACEHOLDER', slideNumber: 2 },
    ]);
  });

  it('accepts exactly sixteen unique known source refs on one slide', () => {
    const sourceRefs = Array.from({ length: 16 }, (_, index) => `source-${index}`);
    const evidence = inspectPresentationReadiness({
      planBytes: planBytes([sourceRefs]),
      knownSourceRefs: sourceRefs,
      ooxml: ooxml([slide(1)]),
    });

    expect(evidence.plan).toEqual({ valid: true, slideCount: 1, sourceRefCount: 16 });
    expect(evidence.slides[0]?.sourceRefs).toEqual(sourceRefs);
    expect(evidence.blockers).toEqual([]);
  });

  it.each([
    ['invalid UTF-8', new Uint8Array([0xc3, 0x28])],
    ['malformed JSON', encoder.encode('[{"sourceRefs":]')],
    ['object top level', encoder.encode('{"slides":[]}')],
    ['wrong slide count', planBytes([[]])],
    ['missing own sourceRefs', encoder.encode('[{},{}]')],
    ['non-array sourceRefs', encoder.encode('[{"sourceRefs":[]},{"sourceRefs":"source-a"}]')],
    ['duplicate sourceRefs', encoder.encode('[{"sourceRefs":[]},{"sourceRefs":["source-a","source-a"]}]')],
    [
      'too many sourceRefs',
      encoder.encode(
        JSON.stringify([{ sourceRefs: [] }, { sourceRefs: Array.from({ length: 17 }, (_, i) => `s-${i}`) }])
      ),
    ],
  ])('reports an invalid plan for %s', (_label, bytes) => {
    const evidence = inspectPresentationReadiness({
      planBytes: bytes,
      knownSourceRefs: Array.from({ length: 17 }, (_, index) => (index === 0 ? 'source-a' : `s-${index - 1}`)),
      ooxml: ooxml([slide(1), slide(2)]),
    });

    expect(evidence.plan.valid).toBe(false);
    expect(evidence.blockers.some(({ code }) => code === 'PLAN_INVALID')).toBe(true);
  });

  it('rejects a plan one byte over the configured limit without decoding it', () => {
    const evidence = inspectPresentationReadiness({
      planBytes: new Uint8Array(1_024 * 1_024 + 1),
      knownSourceRefs: [],
      ooxml: ooxml([slide(1)]),
    });

    expect(evidence.plan.valid).toBe(false);
    expect(evidence.blockers).toContainEqual({ code: 'PLAN_INVALID', slideNumber: null });
  });

  it('distinguishes unresolved refs from malformed entries and deduplicates each slide blocker', () => {
    const inspection = ooxml([slide(1), slide(2), slide(3)]);
    const bytes = encoder.encode(
      JSON.stringify([{ sourceRefs: [] }, { sourceRefs: ['known', 'missing-a', 'missing-b'] }, { sourceRefs: [4] }])
    );

    const evidence = inspectPresentationReadiness({
      planBytes: bytes,
      knownSourceRefs: ['known'],
      ooxml: inspection,
    });

    expect(evidence.plan.valid).toBe(false);
    expect(evidence.blockers.filter(({ code }) => code === 'SOURCE_REF_UNRESOLVED')).toEqual([
      { code: 'SOURCE_REF_UNRESOLVED', slideNumber: 2 },
    ]);
    expect(evidence.blockers).toContainEqual({ code: 'PLAN_INVALID', slideNumber: 3 });
  });
});
