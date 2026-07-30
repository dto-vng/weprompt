/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { validateTemplateManifest } from '@process/services/presentation-template/templateManifest';
import { BUILTIN_TEMPLATE_PACKS } from './index';

const REFERENCE_FORMATS = new Set(['pptx', 'docx']);

describe('BUILTIN_TEMPLATE_PACKS', () => {
  it('contains every builtin pack with unique ids', () => {
    const ids = BUILTIN_TEMPLATE_PACKS.map((p) => p.manifest.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'editorial-field-report',
        'simple-light',
        'simple-dark',
        'market-trends-report',
        'business-review',
        'project-kickoff',
        'monthly-steerco',
        'connected-ops',
        'business-report',
        'decision-memo',
        'operations-guide',
        'proposal-sow',
      ])
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every pack has a valid manifest, non-empty theme and svg preview', () => {
    for (const pack of BUILTIN_TEMPLATE_PACKS) {
      expect(() => validateTemplateManifest(pack.manifest)).not.toThrow();
      expect(pack.manifest.source).toBe('builtin');
      expect(pack.themeMd).toContain('Theme Specification');
      expect(pack.previewSvg.trim().startsWith('<svg')).toBe(true);
      if (REFERENCE_FORMATS.has(pack.manifest.format)) {
        expect(pack.referenceSourcePath).toBeDefined();
      } else {
        expect(pack.referenceSourcePath).toBeUndefined();
      }
    }
  });

  it('pptx packs carry the follow-up edit contract at version 3', () => {
    const pptxPacks = BUILTIN_TEMPLATE_PACKS.filter((p) => p.manifest.format === 'pptx');
    expect(pptxPacks.length).toBe(4);
    for (const pack of pptxPacks) {
      expect(pack.themeMd).toContain('## Follow-up edits');
      expect(pack.themeMd).toContain('source documents');
      expect(pack.manifest.version).toBeGreaterThanOrEqual(3);
    }
  });

  it('docx packs clone a reference and carry the follow-up edit contract', () => {
    const docxPacks = BUILTIN_TEMPLATE_PACKS.filter((p) => p.manifest.format === 'docx');
    expect(docxPacks.length).toBe(4);
    for (const pack of docxPacks) {
      expect(pack.manifest.kind).toBe('document');
      expect(pack.manifest.referenceFile).toBe('reference.docx');
      expect(pack.themeMd).toContain('## Follow-up edits');
      expect(pack.themeMd).toContain('source documents');
      expect(pack.referenceSourcePath).toBeDefined();
    }
  });
});
