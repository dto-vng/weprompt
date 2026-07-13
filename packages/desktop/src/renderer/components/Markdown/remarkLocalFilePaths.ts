/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveLocalFileLinkReference } from './markdownUtils';

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

// Candidate absolute path: POSIX (/…), Windows (C:\ / C:/), or /C:/… .
// Consume non-whitespace, stopping at quotes/backticks/closing brackets/angle.
const PATH_CANDIDATE_RE = /(?:\/[A-Za-z]:[\\/]|[A-Za-z]:[\\/]|\/)[^\s"'`)>\]}]+/g;
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
  const reference = resolveLocalFileLinkReference(matched);
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
  PATH_CANDIDATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null = PATH_CANDIDATE_RE.exec(value);
  while (match !== null) {
    const resolved = resolveTrimmed(match[0]);
    if (resolved) {
      if (match.index > lastIndex) nodes.push({ type: 'text', value: value.slice(lastIndex, match.index) });
      nodes.push(makeLink(resolved.matched, resolved));
      lastIndex = match.index + resolved.matched.length;
      PATH_CANDIDATE_RE.lastIndex = lastIndex;
    }
    match = PATH_CANDIDATE_RE.exec(value);
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
      const reference = resolveLocalFileLinkReference(child.value);
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
const remarkLocalFilePaths = () => (tree: MdastNode): void => {
  linkifyMarkdownTree(tree);
};

export default remarkLocalFilePaths;
