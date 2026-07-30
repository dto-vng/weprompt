/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildKbCitationHref } from '@/common/knowledge/citationFormat';

// Pre-processes assistant markdown BEFORE MarkdownView renders it: every plain
// or backticked occurrence of a known knowledge-source fileName becomes a
// `weprompt-kb://` link. Pure string → string, idempotent, and deliberately
// blind to model prose — only exact known names ever match.

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One scan pattern, ordered so protected constructs win over name matches at
 * the same position:
 *  1. fenced code blocks — an unclosed fence (mid-stream) protects to the end
 *  2. existing markdown links/images (also protects our own injected links → idempotence)
 *  3. inline code spans (`` ``x`` `` then `` `x` ``) — handled specially below
 *  4. a known fileName, guarded so it never matches inside a longer token,
 *     another extension (`report.pdf.bak`) or a URL/path segment.
 */
const buildScanPattern = (namesAlternation: string): RegExp =>
  new RegExp(
    [
      '(```|~~~)[\\s\\S]*?(?:\\1|$)',
      '!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)',
      '``[^`\\n]+``',
      '`[^`\\n]+`',
      `(?<![\\w./=-])(${namesAlternation})(?![\\w-]|\\.[A-Za-z0-9])`,
    ].join('|'),
    'g'
  );

const INLINE_CODE_SPAN = /^(`{1,2})([^`\n]+)\1$/;

export const buildSourceLinkifier = (fileNames: readonly string[]): ((markdown: string) => string) => {
  const names = [...new Set(fileNames.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length === 0) return (markdown) => markdown;
  const nameSet = new Set(names);
  const pattern = buildScanPattern(names.map(escapeRegExp).join('|'));
  return (markdown) => {
    if (!markdown) return markdown;
    return markdown.replace(pattern, (segment: string, _fence: string | undefined, plainName: string | undefined) => {
      if (plainName !== undefined) return `[${plainName}](${buildKbCitationHref(plainName)})`;
      const codeSpan = INLINE_CODE_SPAN.exec(segment);
      if (codeSpan) {
        const inner = codeSpan[2].trim();
        if (nameSet.has(inner)) return `[${segment}](${buildKbCitationHref(inner)})`;
      }
      return segment;
    });
  };
};
