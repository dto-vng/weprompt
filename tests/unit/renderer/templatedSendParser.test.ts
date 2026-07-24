/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseTemplatedSend } from '@/renderer/utils/chat/templatedSendParser';

const THEME = '/Users/u/Library/Application Support/Forge/presentation-templates/business-review/THEME.md';
const REF = '/Users/u/Library/Application Support/Forge/presentation-templates/business-review/reference.pptx';
const PPTX_TEXT =
  'Create a presentation from the request below. officecli is a command-line program…\n\nQ3 review\n\nwith two paragraphs';
const HTML_TEXT = 'Create a presentation/report from the request below. Read the attached THEME.md…\n\nsolar deck';

describe('parseTemplatedSend', () => {
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
});
