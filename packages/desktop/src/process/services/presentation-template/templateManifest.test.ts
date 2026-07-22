/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { PresentationTemplateManifest } from '@/common/types/office/presentationTemplate';
import { validateTemplateManifest } from './templateManifest';

const valid: PresentationTemplateManifest = {
  id: 'editorial-field-report',
  name: 'Editorial Field Report',
  description: 'Print-influenced editorial HTML report',
  format: 'html',
  kind: 'report',
  source: 'builtin',
  themeFile: 'THEME.md',
  referenceFile: null,
  preview: 'preview.svg',
  version: 1,
  createdAt: '2026-07-22T00:00:00Z',
};

describe('validateTemplateManifest', () => {
  it('accepts a valid html manifest', () => {
    expect(validateTemplateManifest(valid)).toEqual(valid);
  });

  it('accepts a valid pptx manifest with a reference file', () => {
    const pptx = { ...valid, id: 'business-review', format: 'pptx', kind: 'deck', referenceFile: 'reference.pptx' };
    expect(validateTemplateManifest(pptx).referenceFile).toBe('reference.pptx');
  });

  it('rejects a non-object', () => {
    expect(() => validateTemplateManifest('nope')).toThrow(/invalid manifest/);
  });

  it('rejects bad slugs (uppercase, path traversal, empty)', () => {
    for (const id of ['Bad-Id', '../escape', 'a/b', '', 'a'.repeat(80)]) {
      expect(() => validateTemplateManifest({ ...valid, id })).toThrow(/invalid manifest/);
    }
  });

  it('rejects unknown format / kind / source', () => {
    expect(() => validateTemplateManifest({ ...valid, format: 'pdf' })).toThrow(/invalid manifest/);
    expect(() => validateTemplateManifest({ ...valid, kind: 'poster' })).toThrow(/invalid manifest/);
    expect(() => validateTemplateManifest({ ...valid, source: 'remote' })).toThrow(/invalid manifest/);
  });

  it('rejects file names containing path separators', () => {
    expect(() => validateTemplateManifest({ ...valid, themeFile: '../THEME.md' })).toThrow(/invalid manifest/);
    expect(() => validateTemplateManifest({ ...valid, preview: 'a/preview.svg' })).toThrow(/invalid manifest/);
    expect(() => validateTemplateManifest({ ...valid, referenceFile: 'x\\r.pptx' })).toThrow(/invalid manifest/);
  });

  it('rejects a pptx manifest without referenceFile', () => {
    expect(() => validateTemplateManifest({ ...valid, format: 'pptx', referenceFile: null })).toThrow(
      /invalid manifest/
    );
  });

  it('rejects non-positive or non-integer version', () => {
    expect(() => validateTemplateManifest({ ...valid, version: 0 })).toThrow(/invalid manifest/);
    expect(() => validateTemplateManifest({ ...valid, version: 1.5 })).toThrow(/invalid manifest/);
  });
});
