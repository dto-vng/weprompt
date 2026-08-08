/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { PRESENTATION_RUN_DIRECTIVE_PREFIX } from '@/common/config/constants';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';
import {
  composeAssistantSend,
  composePresentationSend,
  PPTX_DIRECTIVE_PREFIX,
  TEMPLATE_CREATION_DIRECTIVE,
} from './directive';

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
  it('re-exports the shared managed directive prefix under the legacy parser name', () => {
    expect(PPTX_DIRECTIVE_PREFIX).toBe(PRESENTATION_RUN_DIRECTIVE_PREFIX);
  });

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

  it('keeps Office QA scratch outside the project and removes it only after successful delivery', () => {
    for (const format of ['pptx', 'docx'] as const) {
      const result = composePresentationSend(summary(format), 'Create the deliverable', [], {
        runId: '5a68fccc-7b90-49b4-88f9-d78bb88255ed',
        directory: '/private/tmp/aionui-artifact-runs/5a68fccc-7b90-49b4-88f9-d78bb88255ed',
        readyMarker: '/private/tmp/aionui-artifact-runs/5a68fccc-7b90-49b4-88f9-d78bb88255ed/.aionui-delivery-ready',
      });

      expect(result.input).toContain(
        'Use this app-managed scratch directory: `/private/tmp/aionui-artifact-runs/5a68fccc-7b90-49b4-88f9-d78bb88255ed`'
      );
      expect(result.input).toContain(
        'All QA renders, repair scripts, command payloads, backups, and intermediate copies'
      );
      expect(result.input).toContain(
        'write the delivery-ready marker `/private/tmp/aionui-artifact-runs/5a68fccc-7b90-49b4-88f9-d78bb88255ed/.aionui-delivery-ready`'
      );
      expect(result.input).toContain('Do not delete the scratch directory yourself');
      expect(result.input).toContain('If the run fails or is interrupted, preserve the scratch directory');
      expect(result.artifactScratchRunId).toBe('5a68fccc-7b90-49b4-88f9-d78bb88255ed');
    }
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

  it('office directives stop when attached-source extraction is empty or unusable', () => {
    for (const format of ['pptx', 'docx'] as const) {
      const result = composePresentationSend(summary(format), 'Create from the attached source', ['/user/source.docx']);

      expect(result.input).toContain('returns empty or unusable content');
      expect(result.input).toContain('stop and ask the user');
      expect(result.input).toContain('never proceed to build');
    }
  });

  it('docx: falls back to the html directive when the pack has no resolved reference', () => {
    const broken = summary('docx');
    const result = composePresentationSend({ ...broken, referencePath: null }, 'x', []);
    expect(result.input).toContain('ONE self-contained HTML file');
    expect(result.input).not.toContain('reference.docx');
  });
});

describe('composeAssistantSend', () => {
  it.each([
    'Save this look as a reusable template',
    'Create a template from the current design',
    'Turn this visual style into a reusable theme',
  ])('adds template-creation instructions for explicit creation intent: %s', (message) => {
    const result = composeAssistantSend(null, message, []);

    expect(result.input.startsWith(TEMPLATE_CREATION_DIRECTIVE)).toBe(true);
    expect(result.input).toContain('absolute path');
    expect(result.input).toContain('inside the conversation workspace');
    expect(result.input).toContain('Only if you successfully wrote that file during this turn');
    expect(result.input).toContain('exactly one marker');
    expect(result.input).toContain('standalone final line, outside any Markdown fence');
    expect(result.input).toContain('confirming the review card installs');
    expect(result.input.endsWith(message)).toBe(true);
    expect(result.files).toEqual([]);
    expect(result.injectSkills).toEqual([]);
  });

  it.each([
    'Tạo cho tôi một mẫu từ thiết kế này',
    'Làm một template mới từ bố cục hiện tại',
    'Dựng theme từ phong cách này',
    'Lưu giao diện này thành template',
    'Giữ lại phong cách này làm mẫu',
    'Lưu thiết kế này lại thành theme',
    'Chuyển bố cục này thành mẫu',
    'Biến giao diện này thành template',
    'tao cho toi mot template tu thiet ke nay',
    'luu giao dien nay thanh theme',
    'chuyen bo cuc nay thanh template',
    `Ta\u0323o cho tôi một ma\u0302\u0303u từ thiết kế này`,
  ])('adds template-creation instructions for Vietnamese creation intent: %s', (message) => {
    const result = composeAssistantSend(null, message, []);

    expect(result.input.startsWith(TEMPLATE_CREATION_DIRECTIVE)).toBe(true);
    expect(result.input.endsWith(message)).toBe(true);
  });

  it.each([
    'Summarize this report',
    'Create a presentation using the quarterly template',
    'How do reusable templates work?',
    'Update the colors in this design',
  ])('leaves sends without template-creation intent unchanged: %s', (message) => {
    expect(composeAssistantSend(null, message, ['/workspace/source.csv'])).toEqual({
      input: message,
      files: ['/workspace/source.csv'],
      injectSkills: [],
    });
  });

  it.each([
    'Mẫu này có mấy slide?',
    'Dùng template này tạo một bài thuyết trình',
    'Tôi thích phong cách của template này',
    'Hãy cập nhật bố cục của mẫu này',
    // Do not globally strip Vietnamese diacritics: unaccented "mau" is too ambiguous without an ASCII anchor.
    'luu giao dien nay thanh mau',
  ])('leaves Vietnamese sends without explicit template-creation intent byte-for-byte unchanged: %s', (message) => {
    expect(composeAssistantSend(null, message, ['/workspace/source.csv'])).toEqual({
      input: message,
      files: ['/workspace/source.csv'],
      injectSkills: [],
    });
  });

  it('keeps an existing presentation directive prefix while adding template-creation instructions', () => {
    const result = composeAssistantSend(summary('pptx'), 'Save this style as a reusable template', []);

    expect(result.input.startsWith(PPTX_DIRECTIVE_PREFIX)).toBe(true);
    expect(result.input).toContain(TEMPLATE_CREATION_DIRECTIVE);
    expect(result.input.endsWith('Save this style as a reusable template')).toBe(true);
    expect(result.files).toEqual(['/abs/t1/THEME.md', '/abs/t1/reference.pptx']);
    expect(result.injectSkills).toEqual(['officecli']);
  });
});
