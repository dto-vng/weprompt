/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { chunkMarkdown } from '@/common/knowledge/chunker';

describe('chunkMarkdown', () => {
  it('returns a single chunk for a short document', () => {
    const chunks = chunkMarkdown('Just a short note.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Just a short note.');
    expect(chunks[0].headingPath).toBeUndefined();
  });

  it('returns no chunks for empty/whitespace input', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('   \n\n  ')).toEqual([]);
  });

  it('labels a chunk with the deepest heading it contains', () => {
    const md = ['# Onboarding', '', '## Visa letters', '', 'How to request a visa letter.'].join('\n');
    const chunks = chunkMarkdown(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].headingPath).toBe('Onboarding > Visa letters');
    expect(chunks[0].text).toContain('How to request a visa letter.');
  });

  it('a chunk absorbing a new top-level heading takes the new path', () => {
    const md = ['# A', '', 'x'.repeat(4000), '', '# B', '', 'under b'].join('\n');
    const chunks = chunkMarkdown(md, { maxChars: 3200, overlapChars: 400 });
    const last = chunks[chunks.length - 1];
    expect(last.text).toContain('under b');
    expect(last.headingPath).toBe('B'); // heading-only chunks inherit; absorbed headings override
    expect(chunks[0].headingPath).toBe('A');
  });

  it('splits long documents into overlapping chunks under the size cap', () => {
    const paragraph = 'word '.repeat(200).trim(); // ~1000 chars
    const md = Array.from({ length: 10 }, () => paragraph).join('\n\n'); // ~10k chars
    const chunks = chunkMarkdown(md, { maxChars: 3200, overlapChars: 400 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(3200);
    // overlap: a marker taken from inside the previous chunk's 400-char tail
    // must reappear at the start of the next chunk
    for (let i = 1; i < chunks.length; i++) {
      const marker = chunks[i - 1].text.slice(-200, -170);
      expect(chunks[i].text).toContain(marker);
    }
  });

  it('hard-splits a single oversized block', () => {
    const chunks = chunkMarkdown('x'.repeat(10000), { maxChars: 3200, overlapChars: 400 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(3200);
  });
});
