/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import { composePresentationSend } from './directive';

const summary = (format: 'html' | 'pptx'): PresentationTemplateSummary => ({
  manifest: {
    id: 't1',
    name: 'Theme One',
    description: 'd',
    format,
    kind: 'deck',
    source: 'builtin',
    themeFile: 'THEME.md',
    referenceFile: format === 'pptx' ? 'reference.pptx' : null,
    preview: 'preview.svg',
    version: 1,
    createdAt: 'now',
  },
  themePath: '/abs/t1/THEME.md',
  referencePath: format === 'pptx' ? '/abs/t1/reference.pptx' : null,
  previewDataUrl: 'data:image/svg+xml;base64,x',
});

describe('composePresentationSend', () => {
  it('html: prepends the html directive and attaches the theme file', () => {
    const result = composePresentationSend(summary('html'), 'Deck about the solar system', ['/user/file.png']);
    expect(result.input).toContain('THEME.md');
    expect(result.input).toContain('ONE self-contained HTML file');
    expect(result.input).toContain('Do not invent facts');
    expect(result.input.endsWith('Deck about the solar system')).toBe(true);
    expect(result.files).toEqual(['/user/file.png', '/abs/t1/THEME.md']);
    expect(result.injectSkills).toEqual([]);
  });

  it('pptx: references officecli, attaches theme + reference, requests skill injection', () => {
    const result = composePresentationSend(summary('pptx'), 'Q3 business review', []);
    expect(result.input).toContain('officecli load_skill pptx');
    expect(result.input).toContain('reference.pptx');
    expect(result.input).toContain('Never build a deck from scratch');
    expect(result.input).toContain('officecli --version');
    expect(result.input).toContain('will never appear in your tool list');
    expect(result.input).not.toContain('officecli-capable agent');
    expect(result.input).toContain('Follow-up edits');
    expect(result.input).toContain('officecli view screenshot');
    expect(result.input.endsWith('Q3 business review')).toBe(true);
    expect(result.files).toEqual(['/abs/t1/THEME.md', '/abs/t1/reference.pptx']);
    expect(result.injectSkills).toEqual(['officecli']);
  });

  it('does not duplicate files already attached', () => {
    const result = composePresentationSend(summary('html'), 'x', ['/abs/t1/THEME.md']);
    expect(result.files).toEqual(['/abs/t1/THEME.md']);
  });
});
