/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { PRESENTATION_RUN_DIRECTIVE_PREFIX } from '@/common/config/constants';
import {
  composeAssistantSend,
  TEMPLATE_CREATION_DIRECTIVE,
} from '@/renderer/components/chat/TemplateGallery/directive';
import { parseAssistantDirectiveSend, parseTemplatedSend } from '@/renderer/utils/chat/templatedSendParser';

const THEME = '/Users/u/Library/Application Support/Forge/presentation-templates/business-review/THEME.md';
const REF = '/Users/u/Library/Application Support/Forge/presentation-templates/business-review/reference.pptx';
const PPTX_TEXT =
  'Create a presentation from the request below. officecli is a command-line program…\n\nQ3 review\n\nwith two paragraphs';
const HTML_TEXT = 'Create a presentation/report from the request below. Read the attached THEME.md…\n\nsolar deck';
const DOCX_THEME = '/Users/u/Library/Application Support/Forge/presentation-templates/business-report/THEME.md';
const DOCX_REF = '/Users/u/Library/Application Support/Forge/presentation-templates/business-report/reference.docx';
const DOCX_TEXT =
  'Create a Word document from the request below. officecli is a command-line program…\n\nBoard report for Q3';

describe('parseTemplatedSend', () => {
  it('parses the main-owned managed directive while separating template and user attachments', () => {
    const result = parseTemplatedSend(`${PRESENTATION_RUN_DIRECTIVE_PREFIX} Managed rules.\n\nRaw request`, [
      THEME,
      REF,
      '/user/source.xlsx',
    ]);

    expect(result).toEqual({
      templateId: 'business-review',
      userText: 'Raw request',
      templateFiles: [THEME, REF],
      userFiles: ['/user/source.xlsx'],
    });
  });

  it('parses a pptx templated send: id, user text, file split', () => {
    const r = parseTemplatedSend(PPTX_TEXT, [THEME, REF, '/user/data.xlsx']);
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe('business-review');
    expect(r!.userText).toBe('Q3 review\n\nwith two paragraphs');
    expect(r!.templateFiles).toEqual([THEME, REF]);
    expect(r!.userFiles).toEqual(['/user/data.xlsx']);
  });

  it('parses an html templated send', () => {
    const themeOnly = '/x/presentation-templates/simple-dark/THEME.md';
    const r = parseTemplatedSend(HTML_TEXT, [themeOnly]);
    expect(r!.templateId).toBe('simple-dark');
    expect(r!.userText).toBe('solar deck');
  });

  it('returns null without a directive prefix', () => {
    expect(parseTemplatedSend('hello\n\nworld', [THEME])).toBeNull();
  });

  it('returns null without a THEME.md attachment', () => {
    expect(parseTemplatedSend(PPTX_TEXT, ['/user/data.xlsx'])).toBeNull();
  });

  it('returns null when there is no blank-line separator', () => {
    expect(parseTemplatedSend('Create a presentation from the request below. no split', [THEME])).toBeNull();
  });

  it('parses a docx templated send and classifies reference.docx as a template file', () => {
    const r = parseTemplatedSend(DOCX_TEXT, [DOCX_THEME, DOCX_REF, '/user/figures.xlsx']);
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe('business-report');
    expect(r!.userText).toBe('Board report for Q3');
    expect(r!.templateFiles).toEqual([DOCX_THEME, DOCX_REF]);
    expect(r!.userFiles).toEqual(['/user/figures.xlsx']);
  });
});

describe('parseAssistantDirectiveSend', () => {
  it('returns only the user text from a template-creation send', () => {
    expect(
      parseAssistantDirectiveSend(
        `${TEMPLATE_CREATION_DIRECTIVE}\n\nSave this look as a reusable template\n\nKeep the navy palette.`
      )
    ).toEqual({ userText: 'Save this look as a reusable template\n\nKeep the navy palette.' });
  });

  it('does not hide ordinary text or an incomplete directive-shaped send', () => {
    expect(parseAssistantDirectiveSend('Save this look as a reusable template')).toBeNull();
    expect(parseAssistantDirectiveSend(TEMPLATE_CREATION_DIRECTIVE)).toBeNull();
  });

  it('recovers Vietnamese user text from a composed template-creation send', () => {
    const message = 'Biến thiết kế này thành mẫu';
    const composed = composeAssistantSend(null, message, []);

    expect(parseAssistantDirectiveSend(composed.input)).toEqual({ userText: message });
  });
});
