/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { extractPdfText, pageSpanLabel, renderPagesAsMarkdown } from '@/common/knowledge/pdfExtract';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(path.resolve(__dirname, '../../fixtures/knowledge', name)));

describe('extractPdfText', () => {
  it('extracts one entry per page from a text-layer PDF', async () => {
    const result = await extractPdfText(fixture('text-layer.pdf'));
    expect(result.pageCount).toBe(2);
    expect(result.pages).toHaveLength(2);
    expect(result.hasTextLayer).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.pages[0]).toContain('Visa Letter Policy');
    expect(result.pages[0]).toContain('ten working days before departure');
    expect(result.pages[1]).toContain('Expense Reports');
  });

  it('preserves line breaks rather than running the page into one line', async () => {
    const result = await extractPdfText(fixture('text-layer.pdf'));
    // The heading and the body below it must not be concatenated.
    expect(result.pages[0]).toMatch(/Visa Letter Policy\s*\n/);
  });

  it('reports no text layer for an image-only (scanned) PDF', async () => {
    const result = await extractPdfText(fixture('image-only.pdf'));
    expect(result.pageCount).toBe(1);
    expect(result.hasTextLayer).toBe(false);
    expect(result.pages.join('').trim()).toBe('');
  });

  it('stops at maxPages and reports truncation, keeping the true page count', async () => {
    const result = await extractPdfText(fixture('text-layer.pdf'), { maxPages: 1 });
    expect(result.pages).toHaveLength(1);
    expect(result.pageCount).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.pages[0]).toContain('Visa Letter Policy');
  });

  it('reports progress per page against the capped total', async () => {
    const onProgress = vi.fn();
    await extractPdfText(fixture('text-layer.pdf'), { onProgress, progressEveryPages: 1 });
    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('throws a descriptive error for a corrupt PDF instead of leaking the parser error', async () => {
    const notAPdf = new TextEncoder().encode('this is definitely not a pdf');
    await expect(extractPdfText(notAPdf)).rejects.toThrow(/could not be read as a PDF/i);
  });

  it('loads pdfjs lazily through the injected loader exactly once', async () => {
    const real = await extractPdfText(fixture('text-layer.pdf'));
    expect(real.pages).toHaveLength(2);

    const loadPdfjs = vi.fn().mockResolvedValue({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: () =>
            Promise.resolve({
              getTextContent: () => Promise.resolve({ items: [{ str: 'stubbed page text', hasEOL: true }] }),
              cleanup: () => undefined,
            }),
        }),
        destroy: () => Promise.resolve(),
      }),
    });
    const stubbed = await extractPdfText(fixture('text-layer.pdf'), { loadPdfjs });
    expect(loadPdfjs).toHaveBeenCalledTimes(1);
    expect(stubbed.pages).toEqual(['stubbed page text']);
  });
});

describe('renderPagesAsMarkdown', () => {
  it('renders one heading per page so chunks cite a page number', () => {
    const md = renderPagesAsMarkdown(['alpha', 'beta']);
    expect(md).toBe('## Page 1\n\nalpha\n\n## Page 2\n\nbeta');
  });

  it('skips pages that hold no text', () => {
    const md = renderPagesAsMarkdown(['alpha', '   ', 'gamma']);
    expect(md).toBe('## Page 1\n\nalpha\n\n## Page 3\n\ngamma');
  });

  it('returns an empty string when no page has text', () => {
    expect(renderPagesAsMarkdown(['', '  \n '])).toBe('');
  });
});

describe('pageSpanLabel', () => {
  it('labels a chunk that sits on one page with that page', () => {
    expect(pageSpanLabel('## Page 7\n\nsome body text')).toBe('Page 7');
  });

  it('labels a chunk spanning several pages with the whole span', () => {
    // The bug this fixes: the chunker labelled such a chunk `Page 3` — where it
    // ENDS — so a citation pointed past most of the text it was citing.
    expect(pageSpanLabel('## Page 1\n\na\n\n## Page 2\n\nb\n\n## Page 3\n\nc')).toBe('Pages 1–3');
  });

  it('spans the outer pages even when intermediate pages had no text', () => {
    expect(pageSpanLabel('## Page 2\n\na\n\n## Page 5\n\nb')).toBe('Pages 2–5');
  });

  it('returns undefined when the chunk carries no page marker', () => {
    // Happens when a page's body outgrows one chunk: the continuation has no
    // heading of its own, so the caller keeps the chunker's inherited path.
    expect(pageSpanLabel('body text with no heading')).toBeUndefined();
  });

  it('ignores headings that are not page markers', () => {
    expect(pageSpanLabel('## Page 4\n\n## Revenue\n\n### Page of notes')).toBe('Page 4');
  });

  it('is not affected by a previous call (no sticky regex state)', () => {
    const text = '## Page 9\n\nbody';
    expect(pageSpanLabel(text)).toBe('Page 9');
    expect(pageSpanLabel(text)).toBe('Page 9');
  });
});
