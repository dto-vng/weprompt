/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// End-to-end guard for the citation chain, which spans four separately-landed
// streams: pdfExtract writes `## Page N` markers -> the chunker absorbs them ->
// pageSpanLabel relabels a chunk with its true page span -> the citation header
// and href carry that span -> resolveAnchorHeadingText maps it back to one
// heading -> findCitationHeading locates that heading in the preview drawer.
//
// Unit tests pin each half. This pins the JOIN, because its failure mode is
// SILENT: a span resolving to a heading the preview does not contain simply
// opens the drawer at the top, with no error raised anywhere.

import { describe, expect, it } from 'vitest';
import { chunkMarkdown } from '@/common/knowledge/chunker';
import {
  buildCitationHeader,
  buildKbCitationHref,
  parseCitationHeader,
  parseKbCitationHref,
  resolveAnchorHeadingText,
} from '@/common/knowledge/citationFormat';
import { pageSpanLabel, renderPagesAsMarkdown } from '@/common/knowledge/pdfExtract';
import { findCitationHeading } from '@/renderer/pages/project/components/knowledgePreviewAnchor';

/** Stand-in for the markdown renderer: `## Page N` -> `<h2>Page N</h2>`. */
const renderHeadingsToShadowDom = (markdown: string): HTMLElement => {
  const html = markdown
    .split(/\r?\n/)
    .map((line) => {
      const m = /^(#{1,6})\s+(.+)$/.exec(line);
      if (!m) return line.trim() ? `<p>${line.trim()}</p>` : '';
      return `<h${m[1].length}>${m[2].trim()}</h${m[1].length}>`;
    })
    .join('');
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  container.innerHTML = html;
  shadow.appendChild(container);
  return container;
};

/** The production relabel, verbatim from projectKnowledgeService's pdf branch. */
const ingest = (pages: string[]) => {
  const markdown = renderPagesAsMarkdown(pages);
  const chunks = chunkMarkdown(markdown).map((c) => ({
    ...c,
    headingPath: pageSpanLabel(c.text) ?? c.headingPath,
  }));
  return { markdown, chunks };
};

describe('seam: page markers survive the whole citation chain', () => {
  it('every chunk anchor of a multi-page PDF resolves to a heading that exists', () => {
    // ~900 chars/page against the 3200-char chunker: several pages land in one
    // chunk (real `Pages N-M` spans) and the doc still spills into many chunks.
    const pages = Array.from({ length: 12 }, (_, i) => `Body text for page ${i + 1}. `.repeat(32));
    const { markdown, chunks } = ingest(pages);
    const dom = renderHeadingsToShadowDom(markdown);

    expect(chunks.length).toBeGreaterThan(1);
    const spans = chunks.map((c) => c.headingPath);
    expect(spans.some((s) => s?.startsWith('Pages '))).toBe(true);

    for (const chunk of chunks) {
      const anchor = chunk.headingPath;
      expect(anchor, 'every pdf chunk must carry a page anchor').toBeTruthy();

      // header -> parse back
      const header = buildCitationHeader(1, 'scan.pdf', anchor);
      expect(parseCitationHeader(header, ['scan.pdf'])).toEqual({
        ordinal: 1,
        fileName: 'scan.pdf',
        headingPath: anchor,
      });

      // href -> parse back
      const parsedHref = parseKbCitationHref(buildKbCitationHref('scan.pdf', anchor));
      expect(parsedHref).toEqual({ fileName: 'scan.pdf', anchor });

      // anchor -> a heading that is actually in the rendered preview
      const resolved = resolveAnchorHeadingText(parsedHref!.anchor!);
      expect(resolved).toMatch(/^Page \d+$/);
      expect(markdown).toContain(`## ${resolved}`);
      expect(findCitationHeading(dom, parsedHref!.anchor!)?.textContent).toBe(resolved);
    }
  });

  it('resolves to a real heading when leading pages are blank (numbering is preserved)', () => {
    // renderPagesAsMarkdown DROPS empty pages but keeps original numbering, so
    // the first heading is `## Page 3`, not `## Page 1`.
    const { markdown, chunks } = ingest(['', '   ', 'third page body', 'fourth page body']);
    const dom = renderHeadingsToShadowDom(markdown);

    expect(markdown).toContain('## Page 3');
    expect(markdown).not.toContain('## Page 1');
    for (const chunk of chunks) {
      const resolved = resolveAnchorHeadingText(chunk.headingPath!);
      expect(markdown).toContain(`## ${resolved}`);
      expect(findCitationHeading(dom, chunk.headingPath!)?.textContent).toBe(resolved);
    }
  });

  it('an OCR page whose transcription carries its own headings still resolves', () => {
    // The VLM is told to preserve headings, so a page body can contain `##`.
    const { markdown, chunks } = ingest(['## Dieu 1\n\nnoi dung', '## Dieu 2\n\nnoi dung khac']);
    const dom = renderHeadingsToShadowDom(markdown);

    for (const chunk of chunks) {
      const resolved = resolveAnchorHeadingText(chunk.headingPath!);
      expect(findCitationHeading(dom, chunk.headingPath!)?.textContent, `anchor ${chunk.headingPath}`).toBe(resolved);
    }
  });
});
