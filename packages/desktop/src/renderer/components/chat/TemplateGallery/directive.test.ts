/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import { composePresentationSend } from './directive';

const summary = (format: 'html' | 'pptx' | 'docx'): PresentationTemplateSummary => {
  const referenceFile = format === 'pptx' ? 'reference.pptx' : format === 'docx' ? 'reference.docx' : null;
  return {
    manifest: {
      id: 't1',
      name: 'Theme One',
      description: 'd',
      format,
      kind: format === 'docx' ? 'document' : 'deck',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile,
      preview: 'preview.svg',
      version: 1,
      createdAt: 'now',
    },
    themePath: '/abs/t1/THEME.md',
    referencePath: referenceFile ? `/abs/t1/${referenceFile}` : null,
    previewDataUrl: 'data:image/svg+xml;base64,x',
  };
};

describe('composePresentationSend', () => {
  it('html: prepends the html directive and attaches the theme file', () => {
    const result = composePresentationSend(summary('html'), 'Deck about the solar system', ['/user/file.png']);
    expect(result.input).toContain('THEME.md');
    expect(result.input).toContain('ONE self-contained HTML file');
    expect(result.input).toContain('source documents');
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
    expect(result.input).toContain('source documents');
    expect(result.input).toContain('officecli view screenshot');
    expect(result.input.endsWith('Q3 business review')).toBe(true);
    expect(result.files).toEqual(['/abs/t1/THEME.md', '/abs/t1/reference.pptx']);
    expect(result.injectSkills).toEqual(['officecli']);
  });

  it('does not duplicate files already attached', () => {
    const result = composePresentationSend(summary('html'), 'x', ['/abs/t1/THEME.md']);
    expect(result.files).toEqual(['/abs/t1/THEME.md']);
  });

  it('html: injects the officecli skill only when office source documents are attached', () => {
    const withSources = composePresentationSend(summary('html'), 'x', ['/user/q3 revenue.XLSX', '/user/notes.txt']);
    expect(withSources.injectSkills).toEqual(['officecli']);
    const withoutSources = composePresentationSend(summary('html'), 'x', ['/user/photo.png', '/user/notes.txt']);
    expect(withoutSources.injectSkills).toEqual([]);
  });

  it('docx: clones the reference, loads the docx skill, attaches both pack files', () => {
    const result = composePresentationSend(summary('docx'), 'Q3 board report', []);
    expect(result.input).toContain('officecli load_skill docx');
    expect(result.input).toContain('reference.docx');
    expect(result.input).toContain('Never build a document from scratch');
    expect(result.input).toContain('officecli --version');
    expect(result.input).toContain('officecli validate');
    expect(result.input).toContain('officecli view issues');
    expect(result.input).toContain('screenshot --grid auto');
    expect(result.input).toContain('Follow-up edits');
    expect(result.input).toContain('source documents');
    expect(result.input).toContain('Do not invent facts');
    expect(result.input.endsWith('Q3 board report')).toBe(true);
    expect(result.files).toEqual(['/abs/t1/THEME.md', '/abs/t1/reference.docx']);
    expect(result.injectSkills).toEqual(['officecli']);
  });

  it('docx: falls back to the html directive when the pack has no resolved reference', () => {
    const broken = summary('docx');
    const result = composePresentationSend({ ...broken, referencePath: null }, 'x', []);
    expect(result.input).toContain('ONE self-contained HTML file');
    expect(result.input).not.toContain('reference.docx');
  });
});
