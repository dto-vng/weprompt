/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { linkifyMarkdownTree, splitTextValue } from '@/renderer/components/Markdown/remarkLocalFilePaths';
import type { MdastNode } from '@/renderer/components/Markdown/remarkLocalFilePaths';

describe('splitTextValue', () => {
  it('extracts a POSIX artifact path from prose into a link node', () => {
    const parts = splitTextValue('File location: /Users/demo/project/report.pptx');
    expect(parts).toEqual([
      { type: 'text', value: 'File location: ' },
      {
        type: 'link',
        url: '/Users/demo/project/report.pptx',
        title: null,
        children: [{ type: 'text', value: '/Users/demo/project/report.pptx' }],
      },
    ]);
  });

  it('keeps trailing sentence punctuation out of the linked path', () => {
    const parts = splitTextValue('Saved to /Users/demo/project/report.pptx.');
    expect(parts).toEqual([
      { type: 'text', value: 'Saved to ' },
      {
        type: 'link',
        url: '/Users/demo/project/report.pptx',
        title: null,
        children: [{ type: 'text', value: '/Users/demo/project/report.pptx' }],
      },
      { type: 'text', value: '.' },
    ]);
  });

  it('links multiple paths and preserves a line-number suffix', () => {
    const parts = splitTextValue('see /a/b.ts:12 and /c/d.md');
    const links = parts.filter((p) => p.type === 'link');
    expect(links).toEqual([
      { type: 'link', url: '/a/b.ts:12', title: null, children: [{ type: 'text', value: '/a/b.ts:12' }] },
      { type: 'link', url: '/c/d.md', title: null, children: [{ type: 'text', value: '/c/d.md' }] },
    ]);
  });

  it('leaves text without an absolute path untouched', () => {
    expect(splitTextValue('no paths here, just words')).toEqual([{ type: 'text', value: 'no paths here, just words' }]);
  });

  it('does not link a relative path', () => {
    expect(splitTextValue('open report.pptx now')).toEqual([{ type: 'text', value: 'open report.pptx now' }]);
  });
});

describe('linkifyMarkdownTree', () => {
  it('converts a whole-value inline-code path into a link node', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'File location: ' },
            { type: 'inlineCode', value: '/Users/demo/project/report.pptx' },
          ],
        },
      ],
    };
    linkifyMarkdownTree(tree);
    expect(tree.children![0].children).toEqual([
      { type: 'text', value: 'File location: ' },
      {
        type: 'link',
        url: '/Users/demo/project/report.pptx',
        title: null,
        children: [{ type: 'text', value: '/Users/demo/project/report.pptx' }],
      },
    ]);
  });

  it('does not touch inline code that is not a path', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'inlineCode', value: 'npm run dev' }] }],
    };
    linkifyMarkdownTree(tree);
    expect(tree.children![0].children).toEqual([{ type: 'inlineCode', value: 'npm run dev' }]);
  });

  it('does not descend into existing links or fenced code blocks', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        { type: 'code', value: 'cat /Users/demo/project/report.pptx' },
        {
          type: 'link',
          url: 'https://example.com',
          children: [{ type: 'text', value: '/Users/demo/project/report.pptx' }],
        },
      ],
    };
    linkifyMarkdownTree(tree);
    expect(tree.children![0]).toEqual({ type: 'code', value: 'cat /Users/demo/project/report.pptx' });
    expect(tree.children![1]).toEqual({
      type: 'link',
      url: 'https://example.com',
      children: [{ type: 'text', value: '/Users/demo/project/report.pptx' }],
    });
  });
});
