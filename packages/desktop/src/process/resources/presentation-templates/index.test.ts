/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { validateTemplateManifest } from '@process/services/presentation-template/templateManifest';
import { BUILTIN_TEMPLATE_PACKS } from './index';

const REFERENCE_FORMATS = new Set(['pptx', 'docx']);
const TRACK_0_OFFICE_PACK_VERSIONS = new Map([
  ['business-review', 4],
  ['project-kickoff', 4],
  ['monthly-steerco', 4],
  ['connected-ops', 4],
  ['business-report', 4],
  ['decision-memo', 3],
  ['operations-guide', 3],
  ['proposal-sow', 3],
]);

const referenceSampleScan = (themeMd: string): string | undefined =>
  themeMd.split('\n').find((line) => line.includes("grep -iE '") && !line.includes('lorem|TODO|xxx'));

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

  it('pptx packs carry the follow-up edit contract at Track 0 version 4', () => {
    const pptxPacks = BUILTIN_TEMPLATE_PACKS.filter((p) => p.manifest.format === 'pptx');
    expect(pptxPacks.length).toBe(4);
    for (const pack of pptxPacks) {
      expect(pack.themeMd).toContain('## Follow-up edits');
      expect(pack.themeMd).toContain('source documents');
      expect(pack.manifest.version).toBeGreaterThanOrEqual(4);
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

  it('office packs fail closed on empty extraction and reject visible newline escapes', () => {
    const officePacks = BUILTIN_TEMPLATE_PACKS.filter((pack) => REFERENCE_FORMATS.has(pack.manifest.format));

    expect(officePacks).toHaveLength(TRACK_0_OFFICE_PACK_VERSIONS.size);
    for (const pack of officePacks) {
      expect(pack.manifest.version).toBe(TRACK_0_OFFICE_PACK_VERSIONS.get(pack.manifest.id));
      expect(pack.themeMd).toMatch(/returns empty or unusable\s+content/);
      expect(pack.themeMd).toContain('STOP and ask the user');
      expect(pack.themeMd).toContain("grep -F '\\n'");
    }
  });

  it('pptx reference scans avoid generic customer vocabulary and require inspection', () => {
    const pptxThemes = new Map(
      BUILTIN_TEMPLATE_PACKS.filter((pack) => pack.manifest.format === 'pptx').map((pack) => [
        pack.manifest.id,
        pack.themeMd,
      ])
    );

    expect(referenceSampleScan(pptxThemes.get('business-review') ?? '')).not.toMatch(/\bemea\b|\bnrr\b|cac payback/i);
    expect(referenceSampleScan(pptxThemes.get('project-kickoff') ?? '')).not.toMatch(/\bwarehouse\b|operator shifts/i);
    expect(referenceSampleScan(pptxThemes.get('connected-ops') ?? '')).not.toMatch(/connected sites/i);

    for (const themeMd of pptxThemes.values()) {
      expect(themeMd).toContain('first and third commands must print nothing');
      expect(themeMd).not.toContain('THREE checks must print nothing');
      expect(referenceSampleScan(themeMd)).toContain('verify each hit');
      expect(referenceSampleScan(themeMd)).not.toContain('any hit is a leftover');
    }
  });
});
