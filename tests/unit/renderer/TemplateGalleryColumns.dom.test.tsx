/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import TemplateGalleryColumns from '@/renderer/components/chat/TemplateGallery/TemplateGalleryColumns';
import type { PresentationTemplateSummary } from '@/common/types/office/presentationTemplate';

const summary = (id: string, format: 'pptx' | 'html' | 'docx'): PresentationTemplateSummary => {
  const referenceFile = format === 'pptx' ? 'reference.pptx' : format === 'docx' ? 'reference.docx' : null;
  return {
    manifest: {
      id,
      name: id,
      description: 'd',
      format,
      kind: format === 'pptx' ? 'deck' : format === 'docx' ? 'document' : 'report',
      source: 'builtin',
      themeFile: 'THEME.md',
      referenceFile,
      preview: 'preview.svg',
      version: 1,
      createdAt: 'now',
    },
    themePath: `/abs/${id}/THEME.md`,
    referencePath: referenceFile ? `/abs/${id}/${referenceFile}` : null,
    previewDataUrl: 'data:image/svg+xml;base64,x',
  };
};

describe('TemplateGalleryColumns', () => {
  const templates = [
    summary('business-review', 'pptx'),
    summary('simple-dark', 'html'),
    summary('simple-light', 'html'),
    summary('business-report', 'docx'),
  ];

  it('groups strictly by format: each card appears only in its format column', () => {
    render(<TemplateGalleryColumns templates={templates} onSelect={() => {}} onRemove={() => {}} />);
    const pptxCol = screen.getByTestId('template-column-pptx');
    const htmlCol = screen.getByTestId('template-column-html');
    const docxCol = screen.getByTestId('template-column-docx');
    expect(pptxCol).toContainElement(screen.getByTestId('template-card-business-review'));
    expect(htmlCol).toContainElement(screen.getByTestId('template-card-simple-dark'));
    expect(htmlCol).toContainElement(screen.getByTestId('template-card-simple-light'));
    expect(docxCol).toContainElement(screen.getByTestId('template-card-business-report'));
    expect(pptxCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(1);
    expect(htmlCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(2);
    expect(docxCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(1);
  });

  it('renders the docx column with an empty state when no docx packs exist', () => {
    render(
      <TemplateGalleryColumns templates={[summary('simple-dark', 'html')]} onSelect={() => {}} onRemove={() => {}} />
    );
    const docxCol = screen.getByTestId('template-column-docx');
    expect(docxCol.querySelectorAll('[data-testid^=template-card-]')).toHaveLength(0);
  });

  it('sizes columns per mode: large wraps two-up, compact stacks one-per-row', () => {
    const { rerender } = render(
      <TemplateGalleryColumns templates={templates} size='large' onSelect={() => {}} onRemove={() => {}} />
    );
    expect(screen.getByTestId('template-column-docx').className).toContain('min-w-340px');

    rerender(<TemplateGalleryColumns templates={templates} size='compact' onSelect={() => {}} onRemove={() => {}} />);
    expect(screen.getByTestId('template-column-docx').className).toContain('min-w-172px');
  });

  it('marks the selected card and fires onSelect on click', () => {
    const onSelect = vi.fn();
    render(
      <TemplateGalleryColumns
        templates={templates}
        selectedId='business-review'
        onSelect={onSelect}
        onRemove={() => {}}
      />
    );
    expect(screen.getByTestId('template-selected-business-review')).toBeTruthy();
    fireEvent.click(screen.getByTestId('template-card-simple-dark'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ manifest: expect.objectContaining({ id: 'simple-dark' }) })
    );
  });
});
