/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveLocalFileLinkReference, resolveWorkspaceRelativeReference } from './markdownUtils';

// File kinds the preview pane opens. We only auto-linkify a *workspace-relative*
// filename (e.g. `report.html`) when it carries one of these extensions, so prose
// like "index.js", "example.com", or "v2.0" is never turned into a dead file link.
// Absolute paths keep linkifying for any extension (existing behavior).
const ARTIFACT_EXTENSIONS = [
  'html',
  'htm',
  'md',
  'markdown',
  'txt',
  'csv',
  'tsv',
  'json',
  'xlsx',
  'xls',
  'docx',
  'doc',
  'pptx',
  'ppt',
  'pdf',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
];
const ARTIFACT_EXT_PATTERN = ARTIFACT_EXTENSIONS.join('|');
// Whole-string match for a bare workspace-relative artifact filename (used for
// inline-code spans, where the model deliberately code-formats the filename).
const RELATIVE_ARTIFACT_FULL_RE = new RegExp(
  `^(?:\\.?[\\\\/])?(?:[\\w.-]+[\\\\/])*[\\w.-]+\\.(?:${ARTIFACT_EXT_PATTERN})(?::\\d+(?::\\d+)?|#L\\d+(?:-L\\d+)?)?$`,
  'i'
);

/**
 * Minimal structural mdast node shape. We only read/write the fields this
 * plugin touches, so we avoid a dependency on `@types/mdast`.
 */
export type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdastNode[];
};

// Candidate link in prose, two alternatives:
//  1) an absolute path — POSIX (/…), Windows (C:\ / C:/), or /C:/… — consuming
//     non-whitespace up to quotes/backticks/closing brackets/angle (any extension);
//  2) a workspace-relative artifact filename — `report.html`, `./out/chart.svg`,
//     `sub\deck.pptx` — restricted to ARTIFACT_EXTENSIONS so bare prose words with
//     a dot ("index.js", "example.com", "v2.0") are not turned into dead links.
// The absolute alternative is tried first so it swallows a whole path; its greedy
// tail means the relative alternative only fires on a standalone filename. The
// relative alternative's leading lookbehind keeps it from matching the trailing
// segment of an already-consumed path, and its trailing (?![\w]) forbids a partial
// extension match (report.htmlx) while still allowing a following sentence period.
const LINK_CANDIDATE_RE = new RegExp(
  '(?:\\/[A-Za-z]:[\\\\/]|(?<![A-Za-z])[A-Za-z]:[\\\\/]|\\/)[^\\s"\'`)>\\]}]+' +
    `|(?<![\\w./\\\\-])(?:\\.?[\\\\/])?(?:[\\w.-]+[\\\\/])*[\\w.-]+\\.(?:${ARTIFACT_EXT_PATTERN})(?::\\d+(?::\\d+)?|#L\\d+(?:-L\\d+)?)?(?![\\w])`,
  'gi'
);
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]$/;

const makeLink = (path: string, reference: { rawReference: string }): MdastNode => ({
  type: 'link',
  url: reference.rawReference,
  title: null,
  children: [{ type: 'text', value: path }],
});

/**
 * Resolve a candidate path to a reference. Trailing sentence punctuation the
 * regex greedily captured is stripped FIRST — no real filesystem path ends in
 * `.,;:!?)]}'"`, and `resolveLocalFileLinkReference` would otherwise accept a
 * trailing '.' for paths under /Users, /home, etc. (see markdownUtils.ts).
 * A valid `:line[:col]` / `#Lx` suffix ends in a digit, so it survives.
 */
const resolveTrimmed = (candidate: string): { matched: string; rawReference: string } | null => {
  let matched = candidate;
  while (matched.length > 0 && TRAILING_PUNCT_RE.test(matched)) {
    matched = matched.slice(0, -1);
  }
  if (matched.length === 0) return null;
  // Absolute paths resolve directly; a workspace-relative artifact filename
  // (matched by LINK_CANDIDATE_RE's second alternative) resolves against the
  // conversation workspace at click time — see resolveWorkspaceRelativeReference.
  const reference = resolveLocalFileLinkReference(matched) ?? resolveWorkspaceRelativeReference(matched);
  return reference ? { matched, rawReference: reference.rawReference } : null;
};

/**
 * Split a plain-text string into alternating text/link nodes. Only substrings
 * that `resolveLocalFileLinkReference` accepts become links; everything else
 * stays text. Returns a single text node when nothing matches.
 */
export const splitTextValue = (value: string): MdastNode[] => {
  const nodes: MdastNode[] = [];
  let lastIndex = 0;
  LINK_CANDIDATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null = LINK_CANDIDATE_RE.exec(value);
  while (match !== null) {
    const resolved = resolveTrimmed(match[0]);
    if (resolved) {
      if (match.index > lastIndex) nodes.push({ type: 'text', value: value.slice(lastIndex, match.index) });
      nodes.push(makeLink(resolved.matched, resolved));
      lastIndex = match.index + resolved.matched.length;
      LINK_CANDIDATE_RE.lastIndex = lastIndex;
    }
    match = LINK_CANDIDATE_RE.exec(value);
  }
  if (lastIndex < value.length) nodes.push({ type: 'text', value: value.slice(lastIndex) });
  return nodes.length > 0 ? nodes : [{ type: 'text', value }];
};

const linkifyChildren = (parent: MdastNode): void => {
  const children = parent.children;
  if (!children || children.length === 0) return;

  const next: MdastNode[] = [];
  for (const child of children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const parts = splitTextValue(child.value);
      if (parts.some((part) => part.type === 'link')) next.push(...parts);
      else next.push(child);
      continue;
    }
    if (child.type === 'inlineCode' && typeof child.value === 'string') {
      // Models often code-format the artifact filename (`report.html`). Resolve an
      // absolute path directly, else a whole-span workspace-relative artifact
      // filename (extension-whitelisted so `npm run dev` or `example.com` stay code).
      const trimmed = child.value.trim();
      const reference =
        resolveLocalFileLinkReference(child.value) ??
        (RELATIVE_ARTIFACT_FULL_RE.test(trimmed) ? resolveWorkspaceRelativeReference(trimmed) : null);
      if (reference) next.push(makeLink(child.value, reference));
      else next.push(child);
      continue;
    }
    // Never rewrite inside an existing link or a fenced code block.
    if (child.type !== 'link' && child.type !== 'code') linkifyChildren(child);
    next.push(child);
  }
  parent.children = next;
};

/** Mutating tree transform — exported for unit testing. */
export const linkifyMarkdownTree = (tree: MdastNode): void => {
  linkifyChildren(tree);
};

/** remark plugin: linkify absolute file paths so they open in the preview pane. */
const remarkLocalFilePaths =
  () =>
  (tree: MdastNode): void => {
    linkifyMarkdownTree(tree);
  };

export default remarkLocalFilePaths;
