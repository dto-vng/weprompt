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

  it('links a bare workspace-relative artifact filename in prose (WP24141)', () => {
    const parts = splitTextValue('Report created successfully at daily_ai_news_report_sep_2026.html now');
    expect(parts).toEqual([
      { type: 'text', value: 'Report created successfully at ' },
      {
        type: 'link',
        url: 'daily_ai_news_report_sep_2026.html',
        title: null,
        children: [{ type: 'text', value: 'daily_ai_news_report_sep_2026.html' }],
      },
      { type: 'text', value: ' now' },
    ]);
  });

  it('keeps trailing sentence punctuation out of a linked relative filename', () => {
    const parts = splitTextValue('Updated presentation daily_ai_news_insight_report.html.');
    expect(parts).toEqual([
      { type: 'text', value: 'Updated presentation ' },
      {
        type: 'link',
        url: 'daily_ai_news_insight_report.html',
        title: null,
        children: [{ type: 'text', value: 'daily_ai_news_insight_report.html' }],
      },
      { type: 'text', value: '.' },
    ]);
  });

  it('links a relative filename inside a nested folder', () => {
    const parts = splitTextValue('see out/harry_potter_1997_2007.html');
    expect(parts).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'link',
        url: 'out/harry_potter_1997_2007.html',
        title: null,
        children: [{ type: 'text', value: 'out/harry_potter_1997_2007.html' }],
      },
    ]);
  });

  it('does not link a relative name whose extension is not a known artifact type', () => {
    expect(splitTextValue('run index.js and visit example.com now')).toEqual([
      { type: 'text', value: 'run index.js and visit example.com now' },
    ]);
  });

  it('links a Windows drive-letter path', () => {
    const parts = splitTextValue('saved to C:\\Users\\demo\\report.pptx');
    expect(parts).toEqual([
      { type: 'text', value: 'saved to ' },
      {
        type: 'link',
        url: 'C:\\Users\\demo\\report.pptx',
        title: null,
        children: [{ type: 'text', value: 'C:\\Users\\demo\\report.pptx' }],
      },
    ]);
  });

  it('does not mangle non-http URL schemes into local-file links', () => {
    expect(splitTextValue('grab ftp://server/data/file.txt now')).toEqual([
      { type: 'text', value: 'grab ftp://server/data/file.txt now' },
    ]);
    expect(splitTextValue('clone git://host/repo.git here')).toEqual([
      { type: 'text', value: 'clone git://host/repo.git here' },
    ]);
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

  it('converts inline code holding a workspace-relative artifact filename into a link (WP24141)', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Report created successfully at ' },
            { type: 'inlineCode', value: 'daily_ai_news_report_sep_2026.html' },
          ],
        },
      ],
    };
    linkifyMarkdownTree(tree);
    expect(tree.children![0].children).toEqual([
      { type: 'text', value: 'Report created successfully at ' },
      {
        type: 'link',
        url: 'daily_ai_news_report_sep_2026.html',
        title: null,
        children: [{ type: 'text', value: 'daily_ai_news_report_sep_2026.html' }],
      },
    ]);
  });

  it('leaves inline code with a non-artifact extension untouched', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'inlineCode', value: 'example.com' }] }],
    };
    linkifyMarkdownTree(tree);
    expect(tree.children![0].children).toEqual([{ type: 'inlineCode', value: 'example.com' }]);
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
