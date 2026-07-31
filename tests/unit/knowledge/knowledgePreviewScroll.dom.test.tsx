/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The preview drawer must actually scroll to the cited page, not just be
// *capable* of it. Both halves were already covered — findCitationHeading picks
// the heading (knowledgePreviewAnchor.dom.test.ts) and the anchor resolves to
// one (citationFormat.test.ts) — but nothing exercised the component that joins
// them, and its failure mode is silent: no match, no error, opens at top.
//
// The join is timing-sensitive by construction. MarkdownView renders into a
// shadow root via ShadowView, which portals its children only once a `setRoot`
// state update lands (`{root && createPortal(children, root)}`), so the in-shadow
// `.markdown-shadow-body` that `onRef` hands back does NOT exist in the commit
// that mounts it. KnowledgeSourcePreview shows a <Spin/> while loading, so
// MarkdownView mounts in the very commit that flips loading->false — the same
// commit whose effect schedules the one and only requestAnimationFrame.
//
// So this test deliberately uses the REAL MarkdownView/ShadowView rather than a
// stub: a stub renders headings synchronously and would pass while production
// silently failed.

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ShadowView asks the main process for the user's custom CSS and subscribes to
// theme changes; neither matters here, but both must exist to mount.
vi.mock('@/common', () => ({
  ipcBridge: {
    theme: {
      requestCurrent: { invoke: () => Promise.resolve(null) },
      changed: { on: () => () => undefined },
    },
  },
}));

import KnowledgeSourcePreview from '@/renderer/pages/project/components/KnowledgeSourcePreview';

/** Mirrors renderPagesAsMarkdown's output for an 8-page PDF. */
const EIGHT_PAGES = Array.from(
  { length: 8 },
  (_, i) => `## Page ${i + 1}\n\nbody text for page ${i + 1}`
).join('\n\n');

const props = {
  fileName: 'so-tay-nhan-vien-2026.pdf',
  truncated: false,
  failed: false,
  onClose: () => undefined,
  onOpenOriginal: () => undefined,
};

/** Records which element scrollIntoView was called on; jsdom has no impl. */
let scrolledTo: string[] = [];

beforeEach(() => {
  scrolledTo = [];
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = function (this: Element) {
    scrolledTo.push((this.textContent ?? '').trim());
  };
});

describe('KnowledgeSourcePreview citation scroll', () => {
  it('scrolls to the first page of a cited span once the text arrives', async () => {
    // The state openCitation actually leaves behind: drawer open, still loading.
    const view = render(<KnowledgeSourcePreview {...props} text='' loading={true} anchor='Pages 7–8' />);
    expect(scrolledTo).toEqual([]); // nothing to scroll to yet

    // Text arrives -> MarkdownView mounts in this commit.
    view.rerender(<KnowledgeSourcePreview {...props} text={EIGHT_PAGES} loading={false} anchor='Pages 7–8' />);

    await waitFor(() => expect(scrolledTo).toContain('Page 7'));
  });

  it('scrolls to the exact page for a single-page anchor', async () => {
    const view = render(<KnowledgeSourcePreview {...props} text='' loading={true} anchor='Page 8' />);
    view.rerender(<KnowledgeSourcePreview {...props} text={EIGHT_PAGES} loading={false} anchor='Page 8' />);

    await waitFor(() => expect(scrolledTo).toContain('Page 8'));
  });

  it('stays at the top when there is no anchor', async () => {
    // A prose citation carries no anchor (buildKbCitationHref omits it), so the
    // drawer must open at the document start rather than guessing a section.
    const view = render(<KnowledgeSourcePreview {...props} text='' loading={true} />);
    view.rerender(<KnowledgeSourcePreview {...props} text={EIGHT_PAGES} loading={false} />);

    await waitFor(() => expect(document.querySelector('div.markdown-shadow')).toBeTruthy());
    expect(scrolledTo).toEqual([]);
  });

  it('stays at the top when the anchor names no heading in this document', async () => {
    const view = render(<KnowledgeSourcePreview {...props} text='' loading={true} anchor='Pages 90–91' />);
    view.rerender(<KnowledgeSourcePreview {...props} text={EIGHT_PAGES} loading={false} anchor='Pages 90–91' />);

    await waitFor(() => expect(document.querySelector('div.markdown-shadow')).toBeTruthy());
    expect(scrolledTo).toEqual([]);
  });
});
