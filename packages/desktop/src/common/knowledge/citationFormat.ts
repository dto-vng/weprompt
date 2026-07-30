/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The citation-line contract between the knowledge search tool's text output
// (searchCore.formatHitsAsText, Node side) and the renderer's citation
// click-through. Node-free on purpose: the renderer imports the parser from
// here and must never pull searchCore (which drags in node:fs via store.ts).

export type ParsedCitationHeader = { ordinal: number; fileName: string; headingPath?: string };

const HEADER_PATTERN = /^\[(\d+)\] (\S.*)$/;
const SEPARATOR = ' — ';

export const buildCitationHeader = (ordinal: number, fileName: string, headingPath?: string): string =>
  headingPath ? `[${ordinal}] ${fileName}${SEPARATOR}${headingPath}` : `[${ordinal}] ${fileName}`;

/**
 * Parse one `[n] fileName — headingPath` line. Both the fileName and the
 * headingPath may legitimately contain the separator, so when the caller
 * knows the project's source names the longest known name wins; otherwise
 * the first separator splits.
 */
export const parseCitationHeader = (line: string, knownFileNames?: readonly string[]): ParsedCitationHeader | null => {
  const match = HEADER_PATTERN.exec(line);
  if (!match) return null;
  const ordinal = Number(match[1]);
  const remainder = match[2];
  if (knownFileNames) {
    let best: string | null = null;
    for (const name of knownFileNames) {
      if (!name || (best && name.length <= best.length)) continue;
      if (remainder === name || remainder.startsWith(name + SEPARATOR)) best = name;
    }
    if (best) {
      const rest = remainder.slice(best.length);
      return rest
        ? { ordinal, fileName: best, headingPath: rest.slice(SEPARATOR.length) }
        : { ordinal, fileName: best };
    }
  }
  const separatorIndex = remainder.indexOf(SEPARATOR);
  if (separatorIndex === -1) return { ordinal, fileName: remainder };
  return {
    ordinal,
    fileName: remainder.slice(0, separatorIndex),
    headingPath: remainder.slice(separatorIndex + SEPARATOR.length),
  };
};

// --- click-through hrefs ----------------------------------------------------

// Custom scheme for citation links injected into chat markdown. MarkdownView
// intercepts it before any external-URL handling; it must never reach
// openExternalUrl.
const KB_CITATION_PREFIX = 'weprompt-kb://open';

export const isKbCitationHref = (href: string): boolean => href.startsWith(KB_CITATION_PREFIX);

export const buildKbCitationHref = (fileName: string, anchor?: string): string => {
  const query = anchor
    ? `file=${encodeURIComponent(fileName)}&anchor=${encodeURIComponent(anchor)}`
    : `file=${encodeURIComponent(fileName)}`;
  return `${KB_CITATION_PREFIX}?${query}`;
};

export const parseKbCitationHref = (href: string): { fileName: string; anchor?: string } | null => {
  if (!isKbCitationHref(href)) return null;
  const queryIndex = href.indexOf('?');
  if (queryIndex === -1) return null;
  const params = new URLSearchParams(href.slice(queryIndex + 1));
  const fileName = params.get('file');
  if (!fileName) return null;
  const anchor = params.get('anchor');
  return anchor ? { fileName, anchor } : { fileName };
};

// --- anchor → preview heading -------------------------------------------------

// PDF chunk anchors look like `Page 3` / `Pages 1–3` while the extracted text
// has one `## Page N` heading per page (see pdfExtract.ts) — a range points at
// its first page. Everything else scrolls to the trail's most specific segment.
const PAGE_RANGE_PATTERN = /^Pages?\s+(\d+)(?:\s*[–-]\s*\d+)?$/;

export const resolveAnchorHeadingText = (anchor: string): string => {
  const segments = anchor
    .split(' > ')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const target = segments.length > 0 ? segments[segments.length - 1] : '';
  const pageMatch = PAGE_RANGE_PATTERN.exec(target);
  return pageMatch ? `Page ${pageMatch[1]}` : target;
};
