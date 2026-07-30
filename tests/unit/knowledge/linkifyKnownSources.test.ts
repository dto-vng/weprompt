/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildKbCitationHref } from '@/common/knowledge/citationFormat';
import { buildSourceLinkifier } from '@renderer/utils/chat/linkifyKnownSources';

const HREF = buildKbCitationHref('hop-dong.pdf');

describe('buildSourceLinkifier', () => {
  it('wraps a plain occurrence as a kb link', () => {
    const linkify = buildSourceLinkifier(['hop-dong.pdf']);
    expect(linkify('Nguồn: hop-dong.pdf nhé.')).toBe(`Nguồn: [hop-dong.pdf](${HREF}) nhé.`);
  });

  it('wraps a backticked occurrence keeping the code span as link text', () => {
    const linkify = buildSourceLinkifier(['hop-dong.pdf']);
    expect(linkify('File nguồn: `hop-dong.pdf`.')).toBe(`File nguồn: [\`hop-dong.pdf\`](${HREF}).`);
  });

  it('leaves a code span that is not exactly a fileName untouched', () => {
    const linkify = buildSourceLinkifier(['hop-dong.pdf']);
    expect(linkify('run `cat hop-dong.pdf` now')).toBe('run `cat hop-dong.pdf` now');
  });

  it('skips occurrences already inside a markdown link', () => {
    const linkify = buildSourceLinkifier(['hop-dong.pdf']);
    const already = `see [hop-dong.pdf](${HREF}) and [x](https://e.com/hop-dong.pdf)`;
    expect(linkify(already)).toBe(already);
  });

  it('skips occurrences inside fenced code blocks, including unclosed ones', () => {
    const linkify = buildSourceLinkifier(['hop-dong.pdf']);
    const fenced = 'a\n```\nhop-dong.pdf\n```\nb';
    expect(linkify(fenced)).toBe(fenced);
    const unclosed = 'a\n```\nhop-dong.pdf\n';
    expect(linkify(unclosed)).toBe(unclosed);
  });

  it('handles several files and regex metacharacters in names', () => {
    const weird = 'báo cáo (final) + notes.pdf';
    const linkify = buildSourceLinkifier(['hop-dong.pdf', weird]);
    const out = linkify(`x ${weird} y hop-dong.pdf z`);
    expect(out).toBe(`x [${weird}](${buildKbCitationHref(weird)}) y [hop-dong.pdf](${HREF}) z`);
  });

  it('does not match inside longer file-ish tokens', () => {
    const linkify = buildSourceLinkifier(['report.pdf']);
    expect(linkify('annual-report.pdf report.pdf.bak my.report.pdf')).toBe(
      'annual-report.pdf report.pdf.bak my.report.pdf'
    );
    expect(linkify('see report.pdf.')).toBe(`see [report.pdf](${buildKbCitationHref('report.pdf')}).`);
  });

  it('does not corrupt bare URLs containing a source name', () => {
    const linkify = buildSourceLinkifier(['hop-dong.pdf']);
    expect(linkify('https://x.com/hop-dong.pdf')).toBe('https://x.com/hop-dong.pdf');
  });

  it('is idempotent', () => {
    const linkify = buildSourceLinkifier(['hop-dong.pdf']);
    const once = linkify('plain hop-dong.pdf and `hop-dong.pdf`');
    expect(linkify(once)).toBe(once);
  });

  it('is the identity for an empty source list', () => {
    const linkify = buildSourceLinkifier([]);
    const text = 'anything hop-dong.pdf at all';
    expect(linkify(text)).toBe(text);
  });
});
