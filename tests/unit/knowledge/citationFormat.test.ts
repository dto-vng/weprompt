/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  buildCitationHeader,
  buildKbCitationHref,
  isKbCitationHref,
  parseCitationHeader,
  parseKbCitationHref,
  resolveAnchorHeadingText,
} from '@/common/knowledge/citationFormat';
import { formatHitsAsText } from '@/common/knowledge/searchCore';
import type { KnowledgeHit } from '@/common/knowledge/types';

describe('buildCitationHeader / parseCitationHeader round-trip', () => {
  it('round-trips a header with a heading path', () => {
    const line = buildCitationHeader(1, 'hop-dong-ctv-scan.pdf', 'Pages 1–3');
    expect(line).toBe('[1] hop-dong-ctv-scan.pdf — Pages 1–3');
    expect(parseCitationHeader(line)).toEqual({
      ordinal: 1,
      fileName: 'hop-dong-ctv-scan.pdf',
      headingPath: 'Pages 1–3',
    });
  });

  it('round-trips a header without a heading path', () => {
    const line = buildCitationHeader(2, 'hr.md');
    expect(line).toBe('[2] hr.md');
    expect(parseCitationHeader(line)).toEqual({ ordinal: 2, fileName: 'hr.md' });
  });

  it('disambiguates fileNames containing the separator via the known set', () => {
    const name = 'Report — Final.pdf';
    const line = buildCitationHeader(3, name, 'Summary — 2026');
    expect(parseCitationHeader(line, [name])).toEqual({ ordinal: 3, fileName: name, headingPath: 'Summary — 2026' });
    // Without the known set it falls back to first-separator split (still non-null).
    expect(parseCitationHeader(line)?.fileName).toBe('Report');
  });

  it('rejects non-citation lines', () => {
    expect(parseCitationHeader('Found 2 passage(s) in the project knowledge base for "x":')).toBeNull();
    expect(parseCitationHeader('plain text')).toBeNull();
    expect(parseCitationHeader('')).toBeNull();
  });
});

describe('formatHitsAsText byte-identical fixture', () => {
  // This literal is the CONTRACT between searchCore's tool output and the
  // renderer's citation parser. If it fails, one side drifted — fix the drift,
  // never the fixture, unless the format change is deliberate on BOTH ends.
  it('produces exactly the historical output', () => {
    const hits: KnowledgeHit[] = [
      {
        sourceId: 's1',
        sourceName: 'hr.md',
        chunkIndex: 0,
        text: 'visa letter process',
        score: 1,
        headingPath: 'HR > Visa',
      },
      {
        sourceId: 's2',
        sourceName: 'hop-dong-ctv-scan.pdf',
        chunkIndex: 1,
        text: 'dieu khoan hop dong',
        score: 0.5,
        headingPath: 'Pages 1–3',
      },
      { sourceId: 's3', sourceName: 'notes.txt', chunkIndex: 0, text: 'no heading here', score: 0.2 },
    ];
    const expected =
      'Found 3 passage(s) in the project knowledge base for "visa":' +
      '\n\n[1] hr.md — HR > Visa\nvisa letter process' +
      '\n\n[2] hop-dong-ctv-scan.pdf — Pages 1–3\ndieu khoan hop dong' +
      '\n\n[3] notes.txt\nno heading here';
    expect(formatHitsAsText('visa', hits)).toBe(expected);
  });

  it('every header line in formatHitsAsText output parses back to its hit', () => {
    const hits: KnowledgeHit[] = [
      { sourceId: 's1', sourceName: 'hr.md', chunkIndex: 0, text: 'body a', score: 1, headingPath: 'HR > Visa' },
      { sourceId: 's2', sourceName: 'notes.txt', chunkIndex: 0, text: 'body b', score: 0.2 },
    ];
    const lines = formatHitsAsText('q', hits).split('\n');
    const parsed = lines.map((line) => parseCitationHeader(line, ['hr.md', 'notes.txt'])).filter(Boolean);
    expect(parsed).toEqual([
      { ordinal: 1, fileName: 'hr.md', headingPath: 'HR > Visa' },
      { ordinal: 2, fileName: 'notes.txt' },
    ]);
  });
});

describe('kb citation href helpers', () => {
  it('builds and parses an href without anchor', () => {
    const href = buildKbCitationHref('hop-dong.pdf');
    expect(isKbCitationHref(href)).toBe(true);
    expect(parseKbCitationHref(href)).toEqual({ fileName: 'hop-dong.pdf' });
  });

  it('round-trips names and anchors needing encoding', () => {
    const href = buildKbCitationHref('báo cáo (final) + notes.pdf', 'HR > Visa & Travel');
    expect(parseKbCitationHref(href)).toEqual({
      fileName: 'báo cáo (final) + notes.pdf',
      anchor: 'HR > Visa & Travel',
    });
  });

  it('rejects foreign hrefs', () => {
    expect(parseKbCitationHref('https://example.com/?file=x.pdf')).toBeNull();
    expect(isKbCitationHref('file:///tmp/x.pdf')).toBe(false);
    expect(parseKbCitationHref('weprompt-kb://open')).toBeNull();
  });
});

describe('resolveAnchorHeadingText', () => {
  it('takes the most specific segment of a heading trail', () => {
    expect(resolveAnchorHeadingText('HR > Visa letters')).toBe('Visa letters');
    expect(resolveAnchorHeadingText('Single')).toBe('Single');
  });

  it('maps page ranges to their first page heading', () => {
    expect(resolveAnchorHeadingText('Pages 1–3')).toBe('Page 1');
    expect(resolveAnchorHeadingText('Pages 2-4')).toBe('Page 2'); // hyphen fallback
    expect(resolveAnchorHeadingText('Page 3')).toBe('Page 3');
    expect(resolveAnchorHeadingText('Docs > Pages 5–6')).toBe('Page 5');
  });

  it('returns empty string for blank anchors', () => {
    expect(resolveAnchorHeadingText('')).toBe('');
    expect(resolveAnchorHeadingText('  >  ')).toBe('');
  });
});
